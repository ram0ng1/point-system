<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Gdpr;

use Flarum\Gdpr\Data\Type;
use Illuminate\Support\Arr;
use Ramon\PointSystem\Model\PointTransaction;
use Ramon\PointSystem\Model\ShopClaim;
use Ramon\PointSystem\Model\Trade;
use Ramon\PointSystem\Model\UserPoints;

/**
 * Ciclo de vida GDPR dos dados do sistema de pontos: saldo, extrato de
 * transações, itens resgatados e trocas. Registrado só quando `flarum/gdpr`
 * está presente (ver guarda `class_exists` em extend.php).
 *
 * As três fases do contrato têm semânticas distintas de propósito:
 *   - export    → art. 15, o usuário leva o próprio extrato;
 *   - anonymize → art. 18, a linha sobrevive (integridade do fórum: saldos
 *                 trocados precisam continuar batendo do outro lado) mas todo
 *                 texto livre que possa identificar o usuário é apagado;
 *   - delete    → art. 17, remoção real. As FKs já são `cascadeOnDelete`, mas
 *                 declarar aqui é defesa em profundidade caso a FK caia.
 */
class PointSystemData extends Type
{
    /**
     * Motivos gerados pelo próprio sistema. Qualquer valor FORA desta lista em
     * `point_system_transactions.reason` é texto livre digitado por um admin no
     * ajuste manual (até 200 chars) e pode conter nome, apelido ou contexto
     * identificável — por isso é normalizado no anonymize.
     */
    private const SYSTEM_REASONS = [
        'discussion.started',
        'post.posted',
        'like.received',
        'like.given',
        'user.registered',
        'user.daily_login',
        'shop.claim',
        'tier.claim',
        'group.purchase',
    ];

    public static function dataType(): string
    {
        return 'PointSystem';
    }

    /**
     * Chaves serializadas que carregam PII. `reason` entra porque o ajuste
     * manual é texto livre de admin; `meta` porque é um blob arbitrário.
     */
    public static function piiFields(): array
    {
        return ['reason', 'meta'];
    }

    public function export(): ?array
    {
        $userId = (int) $this->user->id;
        $out = [];

        $points = UserPoints::query()->where('user_id', $userId)->first();
        if ($points !== null) {
            $out[] = ['point-system/balance.json' => $this->encodeForExport([
                'balance' => (int) $points->balance,
                'lifetime' => (int) $points->lifetime,
            ])];
        }

        PointTransaction::query()
            ->where('user_id', $userId)
            ->orderBy('created_at')
            ->each(function (PointTransaction $tx) use (&$out) {
                $out[] = ["point-system/transactions/tx-{$tx->id}.json" => $this->encodeForExport(
                    Arr::only($tx->toArray(), ['amount', 'reason', 'reference_type', 'reference_id', 'meta', 'created_at'])
                )];
            });

        ShopClaim::query()
            ->where('user_id', $userId)
            ->orderBy('id')
            ->each(function (ShopClaim $claim) use (&$out) {
                $out[] = ["point-system/claims/claim-{$claim->id}.json" => $this->encodeForExport(
                    Arr::only($claim->toArray(), ['item_type', 'item_id', 'quantity', 'claimed_at'])
                )];
            });

        // Trocas: exporta os DOIS lados porque o usuário é parte do contrato,
        // mas só os IDs da contraparte — o username do outro participante é
        // dado dele, não deste titular.
        Trade::query()
            ->where(fn ($q) => $q->where('initiator_id', $userId)->orWhere('recipient_id', $userId))
            ->orderBy('id')
            ->each(function (Trade $trade) use (&$out, $userId) {
                $isInitiator = (int) $trade->initiator_id === $userId;
                $out[] = ["point-system/trades/trade-{$trade->id}.json" => $this->encodeForExport([
                    'role' => $isInitiator ? 'initiator' : 'recipient',
                    'counterpartyId' => $isInitiator ? (int) $trade->recipient_id : (int) $trade->initiator_id,
                    'pointsOffered' => (int) ($isInitiator ? $trade->initiator_points : $trade->recipient_points),
                    'pointsReceived' => (int) ($isInitiator ? $trade->recipient_points : $trade->initiator_points),
                    'status' => (string) $trade->status,
                    'items' => $trade->items->map(fn ($i) => [
                        'itemType' => $i->item_type,
                        'itemId' => (int) $i->item_id,
                        'side' => (int) $i->owner_id === $userId ? 'given' : 'received',
                    ])->values()->toArray(),
                    'created_at' => optional($trade->created_at)?->toIso8601String(),
                    'completed_at' => optional($trade->completed_at)?->toIso8601String(),
                ])];
            });

        return $out ?: null;
    }

    public function anonymize(): void
    {
        $userId = (int) $this->user->id;

        // O extrato numérico sobrevive (o saldo precisa continuar auditável),
        // mas o texto livre do admin some. `whereNotIn` normaliza só o que não
        // é slug de sistema — os motivos gerados pelo código não identificam
        // ninguém e mantê-los preserva a leitura do histórico.
        PointTransaction::query()
            ->where('user_id', $userId)
            ->whereNotIn('reason', self::SYSTEM_REASONS)
            ->update(['reason' => 'admin.adjustment']);

        PointTransaction::query()
            ->where('user_id', $userId)
            ->whereNotNull('meta')
            ->update(['meta' => null]);
    }

    public function delete(): void
    {
        $userId = (int) $this->user->id;

        // Trocas primeiro: os itens têm FK para a troca, então apagar a troca
        // leva os itens junto por cascade.
        Trade::query()
            ->where(fn ($q) => $q->where('initiator_id', $userId)->orWhere('recipient_id', $userId))
            ->delete();

        PointTransaction::query()->where('user_id', $userId)->delete();
        ShopClaim::query()->where('user_id', $userId)->delete();
        UserPoints::query()->where('user_id', $userId)->delete();
    }
}
