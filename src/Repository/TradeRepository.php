<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Repository;

use Carbon\Carbon;
use Flarum\Foundation\ValidationException;
use Flarum\User\User;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Database\ConnectionInterface;
use Ramon\PointSystem\Event\TradeCompleted;
use Ramon\PointSystem\Model\PointTransaction;
use Ramon\PointSystem\Model\ShopClaim;
use Ramon\PointSystem\Model\Trade;
use Ramon\PointSystem\Model\TradeItem;
use Ramon\PointSystem\Model\UserPoints;

/**
 * Atomic trade executor.
 *
 * `execute()` runs the full transfer in a single DB transaction with explicit
 * row locks on both UserPoints rows AND every ShopClaim row being moved. This
 * closes the TOCTOU window where two parallel "accept" requests (one from
 * each side at the same moment) could both pass the validation check and
 * then transfer items the other side just shed.
 *
 * Trade flow assumed by callers:
 *   1) Trade row exists with status=pending and both accept flags true.
 *   2) `execute()` is called with the trade id. It re-reads everything under
 *      lock, validates ownership + balances, and commits the transfer.
 *   3) On success: trade is marked completed, items' ShopClaim.user_id is
 *      flipped, points move between balance ledgers, and a TradeCompleted
 *      event is dispatched (consumed by the notification listener).
 *
 * On failure (insufficient balance, missing item, etc.) the transaction
 * rolls back and the trade is reset to pending with both accepts cleared —
 * the UI then surfaces an error so the participants can fix their offers.
 */
class TradeRepository
{
    public function __construct(
        protected ConnectionInterface $db,
        protected Dispatcher $events,
    ) {}

    /**
     * Mapa estável `tipo de decoração → coluna em `point_system_user_points``.
     * Usado em duas passagens dentro de execute() (validação pré-transfer e
     * limpeza pós-transfer) — manter UMA definição evita drift entre os dois
     * passos.
     */
    private const EQUIPPED_COLUMN_BY_TYPE = [
        'avatar_decoration'         => 'current_avatar_decoration_id',
        'name_decoration'           => 'current_name_decoration_id',
        'cover_decoration'          => 'current_cover_decoration_id',
        'title_decoration'          => 'current_title_decoration_id',
        'post_highlight_decoration' => 'current_post_hl_decoration_id',
    ];

    /**
     * Try to execute a trade. Returns the trade in its post-execution state.
     * Throws ValidationException with a stable code when the trade cannot
     * commit (insufficient points, item ownership lost, etc.).
     *
     * O método foi quebrado em sub-rotinas privadas (refator 2026-05-24, antes
     * eram 200+ linhas com 4 níveis de aninhamento). Cada helper corre dentro
     * da MESMA transação externa — o try/catch aqui captura o
     * ValidationException pra rodar o reset dos `accepted` em transação
     * separada (necessário porque o throw rola a interna pra trás).
     */
    public function execute(int $tradeId): Trade
    {
        try {
            return $this->db->transaction(fn () => $this->doExecute($tradeId));
        } catch (ValidationException $e) {
            $this->resetAcceptsAfterFailure($tradeId, $e);
            throw $e;
        }
    }

    /** Núcleo de execute() — corre dentro de uma transação externa. */
    private function doExecute(int $tradeId): Trade
    {
        $trade           = $this->loadAndLockTrade($tradeId);
        $points          = $this->loadAndLockPoints($trade);
        $this->assertBalances($trade, $points);

        $tradeItems      = $this->loadAndLockTradeItems($trade);
        $this->assertNothingEquipped($tradeItems, $points);

        [$donorClaims, $recipientClaims] = $this->loadAndLockClaimsForTransfer($trade, $tradeItems);

        $this->movePoints($trade, $points);
        $this->writePointAuditRows($trade);
        $this->transferClaims($trade, $tradeItems, $donorClaims, $recipientClaims, $points);
        $this->markCompleted($trade);

        // Dispatch dentro da transação ainda — mantém o trade-off
        // "rollback se a notificação falhar" descrito no comentário antigo.
        $this->events->dispatch(new TradeCompleted($trade));

        return $trade;
    }

    /** Carrega e tranca a row do trade. Falha em `not_open` ou `not_both_accepted`. */
    private function loadAndLockTrade(int $tradeId): Trade
    {
        /** @var Trade $trade */
        $trade = Trade::query()->where('id', $tradeId)->lockForUpdate()->firstOrFail();

        if (! $trade->isOpen()) {
            throw new ValidationException(['trade' => 'not_open']);
        }
        if (! $trade->initiator_accepted || ! $trade->recipient_accepted) {
            throw new ValidationException(['trade' => 'not_both_accepted']);
        }
        return $trade;
    }

    /**
     * Tranca AMBAS as linhas de UserPoints em ordem estável (anti-deadlock)
     * e cria-as caso o usuário ainda não tenha sido inicializado.
     *
     * @return array<int, UserPoints> chaveado por user_id
     */
    private function loadAndLockPoints(Trade $trade): array
    {
        $userIds = [(int) $trade->initiator_id, (int) $trade->recipient_id];
        sort($userIds, SORT_NUMERIC);

        $points = UserPoints::query()
            ->whereIn('user_id', $userIds)
            ->orderBy('user_id')
            ->lockForUpdate()
            ->get()
            ->keyBy('user_id')
            ->all();

        foreach ($userIds as $uid) {
            if (! isset($points[$uid])) {
                $points[$uid] = UserPoints::firstOrCreate(
                    ['user_id' => $uid],
                    ['balance' => 0, 'lifetime' => 0],
                );
            }
        }
        return $points;
    }

    /** @param array<int, UserPoints> $points */
    private function assertBalances(Trade $trade, array $points): void
    {
        if ((int) $points[(int) $trade->initiator_id]->balance < (int) $trade->initiator_points) {
            throw new ValidationException(['trade' => 'initiator_insufficient_points']);
        }
        if ((int) $points[(int) $trade->recipient_id]->balance < (int) $trade->recipient_points) {
            throw new ValidationException(['trade' => 'recipient_insufficient_points']);
        }
    }

    /** Lock + load do conjunto de TradeItem da transação. */
    private function loadAndLockTradeItems(Trade $trade): \Illuminate\Database\Eloquent\Collection
    {
        return TradeItem::query()
            ->where('trade_id', $trade->id)
            ->lockForUpdate()
            ->get();
    }

    /**
     * Recusa se algum item ofertado está equipado pelo doador. O
     * UpdateTradeOfferController já barra no PATCH, mas a janela
     * equipar→aceitar→finalize não passa por lá — aqui é o portão final
     * (regra pedida em 2026-05-23).
     *
     * @param array<int, UserPoints> $points
     */
    private function assertNothingEquipped(
        \Illuminate\Database\Eloquent\Collection $tradeItems,
        array $points,
    ): void {
        foreach ($tradeItems as $ti) {
            $col = self::EQUIPPED_COLUMN_BY_TYPE[(string) $ti->item_type] ?? null;
            if ($col === null) continue;
            $ownerPoints = $points[(int) $ti->owner_id] ?? null;
            if (! $ownerPoints) continue;
            if ((int) ($ownerPoints->{$col} ?? 0) === (int) $ti->item_id) {
                throw new ValidationException(['trade' => 'item_equipped']);
            }
        }
    }

    /**
     * Tranca o claim do DOADOR e o claim do DESTINATÁRIO (se existir) de cada
     * TradeItem. Devolve `[donorClaims, recipientClaims]` chaveados por
     * tradeItem.id. Lança `item_unavailable` se o doador não tem o item
     * (race com unclaim/admin entre accept e execute).
     *
     * @return array{0: array<int, ShopClaim>, 1: array<int, ShopClaim|null>}
     */
    private function loadAndLockClaimsForTransfer(
        Trade $trade,
        \Illuminate\Database\Eloquent\Collection $tradeItems,
    ): array {
        $donorClaims     = [];
        $recipientClaims = [];

        foreach ($tradeItems as $ti) {
            $donor = ShopClaim::query()
                ->where('user_id', $ti->owner_id)
                ->where('item_type', $ti->item_type)
                ->where('item_id', $ti->item_id)
                ->lockForUpdate()
                ->first();
            if (! $donor || (int) $donor->quantity < 1) {
                throw new ValidationException(['trade' => 'item_unavailable']);
            }
            $donorClaims[(int) $ti->id] = $donor;

            $newOwnerId = $this->resolveCounterparty($trade, (int) $ti->owner_id);
            $recipient = ShopClaim::query()
                ->where('user_id', $newOwnerId)
                ->where('item_type', $ti->item_type)
                ->where('item_id', $ti->item_id)
                ->lockForUpdate()
                ->first();
            $recipientClaims[(int) $ti->id] = $recipient;
        }
        return [$donorClaims, $recipientClaims];
    }

    /**
     * Movimenta pontos entre os dois saldos. Lifetime fica intacto — trade
     * não conta como conquista de forum (essa métrica é reservada pra
     * pontos ganhos por ação).
     *
     * @param array<int, UserPoints> $points
     */
    private function movePoints(Trade $trade, array $points): void
    {
        $delta = (int) $trade->recipient_points - (int) $trade->initiator_points;
        $initiator = $points[(int) $trade->initiator_id];
        $recipient = $points[(int) $trade->recipient_id];

        $initiator->balance = (int) $initiator->balance + $delta;
        $recipient->balance = (int) $recipient->balance - $delta;
        $initiator->save();
        $recipient->save();
    }

    /** Grava 2 linhas de PointTransaction (uma por lado) refletindo o net delta. */
    private function writePointAuditRows(Trade $trade): void
    {
        $delta = (int) $trade->recipient_points - (int) $trade->initiator_points;
        if ($delta === 0) return;

        PointTransaction::create([
            'user_id'        => $trade->initiator_id,
            'amount'         => $delta,
            'reason'         => 'trade',
            'reference_type' => 'trade',
            'reference_id'   => $trade->id,
        ]);
        PointTransaction::create([
            'user_id'        => $trade->recipient_id,
            'amount'         => -$delta,
            'reason'         => 'trade',
            'reference_type' => 'trade',
            'reference_id'   => $trade->id,
        ]);
    }

    /**
     * Transfere 1 unidade por TradeItem do doador pro destinatário.
     * Decremento do doador, incremento (ou INSERT) no destinatário. Quando
     * o estoque do doador zera E o item estava equipado, limpa o ponteiro
     * `current_*_decoration_id` no mesmo passo (sem isso o doador continua
     * vendo botão "Equipado" pós-trade).
     *
     * @param array<int, ShopClaim>      $donorClaims
     * @param array<int, ShopClaim|null> $recipientClaims
     * @param array<int, UserPoints>     $points
     */
    private function transferClaims(
        Trade $trade,
        \Illuminate\Database\Eloquent\Collection $tradeItems,
        array $donorClaims,
        array $recipientClaims,
        array $points,
    ): void {
        $dirtyPointsRows = [];

        foreach ($tradeItems as $ti) {
            $donor       = $donorClaims[(int) $ti->id];
            $recipient   = $recipientClaims[(int) $ti->id];
            $newOwnerId  = $this->resolveCounterparty($trade, (int) $ti->owner_id);

            $donor->quantity = (int) $donor->quantity - 1;
            $donorEmptied = (int) $donor->quantity <= 0;
            if ($donorEmptied) {
                $donor->delete();
            } else {
                $donor->save();
            }

            if ($recipient) {
                $recipient->quantity = (int) $recipient->quantity + 1;
                $recipient->save();
            } else {
                ShopClaim::create([
                    'user_id'    => $newOwnerId,
                    'item_type'  => (string) $ti->item_type,
                    'item_id'    => (int) $ti->item_id,
                    'quantity'   => 1,
                    // Recipient não pagou — pontos movem via PointTransaction.
                    'price_paid' => 0,
                ]);
            }

            if ($donorEmptied) {
                $donorPoints = $points[(int) $ti->owner_id] ?? null;
                $column = self::EQUIPPED_COLUMN_BY_TYPE[(string) $ti->item_type] ?? null;
                if ($donorPoints && $column && (int) ($donorPoints->{$column} ?? 0) === (int) $ti->item_id) {
                    $donorPoints->{$column} = null;
                    $dirtyPointsRows[(int) $ti->owner_id] = $donorPoints;
                }
            }
        }

        foreach ($dirtyPointsRows as $row) {
            $row->save();
        }
    }

    private function markCompleted(Trade $trade): void
    {
        $trade->status = Trade::STATUS_COMPLETED;
        $trade->completed_at = Carbon::now();
        $trade->save();
    }

    /** Dada uma id de uma das partes do trade, devolve a id da outra. */
    private function resolveCounterparty(Trade $trade, int $ownerId): int
    {
        return $ownerId === (int) $trade->initiator_id
            ? (int) $trade->recipient_id
            : (int) $trade->initiator_id;
    }

    /**
     * Após uma falha de validação dentro de execute(), a transação inteira
     * já foi revertida — inclusive um eventual `resetAccepts()` interno. Esta
     * função roda UM UPDATE atômico (sem transação) limpando os accept flags,
     * para que o client (que continua disparando /finalize enquanto vê
     * "both accepted, pending") pare o loop. Pulamos `not_open` pra não
     * sujar a audit trail de trade já completo/cancelado.
     */
    private function resetAcceptsAfterFailure(int $tradeId, ValidationException $e): void
    {
        $code = (string) ($e->getAttributes()['trade'] ?? '');
        if ($code === '' || $code === 'not_open') {
            return;
        }
        Trade::query()
            ->where('id', $tradeId)
            ->update([
                'initiator_accepted' => false,
                'recipient_accepted' => false,
                'updated_at' => Carbon::now(),
            ]);
    }

    /** Reset both accept flags in-place. Used when an offer mutation
     *  invalidates a prior agreement. */
    public function resetAccepts(Trade $trade): void
    {
        $trade->initiator_accepted = false;
        $trade->recipient_accepted = false;
        $trade->save();
    }

    /** Cancel a pending trade. Idempotent. */
    public function cancel(Trade $trade, User $by): Trade
    {
        if (! $trade->isOpen()) {
            return $trade;
        }
        $trade->status = Trade::STATUS_CANCELLED;
        $trade->cancelled_by_id = (int) $by->id;
        $trade->cancelled_at = Carbon::now();
        $trade->save();
        return $trade;
    }

    /**
     * Admin-only revert of a completed trade. Undoes the ShopClaim ownership
     * flip and the points movement, then marks the trade `cancelled` with
     * `cancelled_by_id` set to the admin actor.
     *
     * The revert is best-effort defensive: if either party RE-traded one of
     * the items after the original completion, the claim no longer sits with
     * the post-trade owner and the revert can't safely return it without
     * stealing from a third party. In that case the revert throws
     * `item_re_traded` — the admin's choice is to either manually transfer
     * the item by hand or to leave the trade in place.
     *
     * Points are reverted by reversing the exact delta we wrote on execute.
     * If a participant has since spent below the threshold to absorb the
     * reversal, the revert proceeds but the balance is allowed to go
     * negative — we never silently leave inventory and points half-restored.
     * The admin can manually reconcile via the award/revoke flow.
     */
    public function revert(int $tradeId, User $by): Trade
    {
        return $this->db->transaction(function () use ($tradeId, $by) {
            /** @var Trade $trade */
            $trade = Trade::query()->where('id', $tradeId)->lockForUpdate()->firstOrFail();

            if ($trade->status !== Trade::STATUS_COMPLETED) {
                throw new ValidationException(['trade' => 'not_completed']);
            }

            // Lock balance rows in stable order (same approach as execute()).
            $userIds = [(int) $trade->initiator_id, (int) $trade->recipient_id];
            sort($userIds, SORT_NUMERIC);

            $points = UserPoints::query()
                ->whereIn('user_id', $userIds)
                ->orderBy('user_id')
                ->lockForUpdate()
                ->get()
                ->keyBy('user_id');

            foreach ($userIds as $uid) {
                if (! isset($points[$uid])) {
                    $points[$uid] = UserPoints::firstOrCreate(
                        ['user_id' => $uid],
                        ['balance' => 0, 'lifetime' => 0],
                    );
                }
            }

            // Lock and verify each TradeItem's CURRENT claim. After execute(),
            // each item's ShopClaim.user_id holds the OPPOSITE side of the
            // original `owner_id`. We re-flip back to `owner_id`.
            $tradeItems = TradeItem::query()
                ->where('trade_id', $trade->id)
                ->lockForUpdate()
                ->get();

            $reverseOwnerMap = []; // [tradeItemId => current ShopClaim]
            foreach ($tradeItems as $ti) {
                $postTradeOwnerId = (int) $ti->owner_id === (int) $trade->initiator_id
                    ? (int) $trade->recipient_id
                    : (int) $trade->initiator_id;

                /** @var ShopClaim|null $claim */
                $claim = ShopClaim::query()
                    ->where('user_id', $postTradeOwnerId)
                    ->where('item_type', $ti->item_type)
                    ->where('item_id', $ti->item_id)
                    ->lockForUpdate()
                    ->first();

                if (! $claim) {
                    // Either the post-trade owner re-traded / gifted the item,
                    // or it was manually moved by an admin. Refusing keeps the
                    // revert atomic — partial restores are worse than none.
                    throw new ValidationException(['trade' => 'item_re_traded']);
                }
                $reverseOwnerMap[(int) $ti->id] = $claim;
            }

            // ── REVERSE ─────────────────────────────────────────────────
            $initiatorPoints = $points[(int) $trade->initiator_id];
            $recipientPoints = $points[(int) $trade->recipient_id];

            // execute() did: initiator.balance += (recipient_points - initiator_points)
            //                recipient.balance -= (recipient_points - initiator_points)
            // Revert is the same delta with opposite sign on each side.
            $delta = (int) $trade->recipient_points - (int) $trade->initiator_points;
            $initiatorPoints->balance = (int) $initiatorPoints->balance - $delta;
            $recipientPoints->balance = (int) $recipientPoints->balance + $delta;
            $initiatorPoints->save();
            $recipientPoints->save();

            if ($delta !== 0) {
                PointTransaction::create([
                    'user_id'        => $trade->initiator_id,
                    'amount'         => -$delta,
                    'reason'         => 'trade_reverted',
                    'reference_type' => 'trade',
                    'reference_id'   => $trade->id,
                ]);
                PointTransaction::create([
                    'user_id'        => $trade->recipient_id,
                    'amount'         => $delta,
                    'reason'         => 'trade_reverted',
                    'reference_type' => 'trade',
                    'reference_id'   => $trade->id,
                ]);
            }

            // Flip ShopClaim ownership BACK to the pre-trade owner.
            foreach ($tradeItems as $ti) {
                $claim = $reverseOwnerMap[(int) $ti->id];
                $claim->user_id = (int) $ti->owner_id;
                $claim->save();
            }

            // Mark the trade as cancelled (re-using the existing status to
            // avoid a migration). `cancelled_by_id` identifies the admin who
            // performed the revert; `completed_at` is preserved so we still
            // have the original execution timestamp on the audit trail.
            $trade->status = Trade::STATUS_CANCELLED;
            $trade->cancelled_by_id = (int) $by->id;
            $trade->cancelled_at = Carbon::now();
            $trade->save();

            return $trade;
        });
    }
}
