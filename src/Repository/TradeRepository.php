<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Repository;

use Carbon\Carbon;
use Flarum\Foundation\ValidationException;
use Flarum\User\User;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Database\ConnectionResolverInterface;
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
        protected ConnectionResolverInterface $db,
        protected Dispatcher $events,
    ) {}

    /**
     * Try to execute a trade. Returns the trade in its post-execution state.
     * Throws ValidationException with a stable code when the trade cannot
     * commit (insufficient points, item ownership lost, etc.).
     */
    public function execute(int $tradeId): Trade
    {
        // We MUST NOT call `$this->resetAccepts($trade)` inside the same
        // transaction that we throw from — the throw rolls the transaction
        // back, undoing the reset, so `initiator_accepted` and
        // `recipient_accepted` stay `true` in the DB. Combined with the
        // client polling + countdown logic that re-fires /finalize whenever
        // it sees "both accepted, pending", that creates an infinite 422
        // retry loop: server rejects → client refreshes → server still
        // says both accepted → countdown → server rejects → …
        //
        // Capture the validation outcome, let the transaction roll back,
        // THEN run the accept-flag reset in a separate transaction (or no
        // transaction — a single UPDATE is atomic enough).
        try {
            return $this->db->connection()->transaction(function () use ($tradeId) {
                /** @var Trade $trade */
                $trade = Trade::query()->where('id', $tradeId)->lockForUpdate()->firstOrFail();

                if (! $trade->isOpen()) {
                    throw new ValidationException(['trade' => 'not_open']);
                }
                if (! $trade->initiator_accepted || ! $trade->recipient_accepted) {
                    throw new ValidationException(['trade' => 'not_both_accepted']);
                }

                // Lock both balance rows up-front and in a stable order so two
                // simultaneous executions of the same trade (or unrelated trades
                // sharing one participant) cannot deadlock.
                $userIds = [(int) $trade->initiator_id, (int) $trade->recipient_id];
                sort($userIds, SORT_NUMERIC);

                $points = UserPoints::query()
                    ->whereIn('user_id', $userIds)
                    ->orderBy('user_id')
                    ->lockForUpdate()
                    ->get()
                    ->keyBy('user_id');

                // Ensure both rows exist — auto-create if a participant has
                // somehow not been initialised yet (e.g. pre-extension users).
                foreach ($userIds as $uid) {
                    if (! isset($points[$uid])) {
                        $points[$uid] = UserPoints::firstOrCreate(
                            ['user_id' => $uid],
                            ['balance' => 0, 'lifetime' => 0],
                        );
                    }
                }

                $initiatorPoints = $points[(int) $trade->initiator_id];
                $recipientPoints = $points[(int) $trade->recipient_id];

                if ((int) $initiatorPoints->balance < (int) $trade->initiator_points) {
                    throw new ValidationException(['trade' => 'initiator_insufficient_points']);
                }
                if ((int) $recipientPoints->balance < (int) $trade->recipient_points) {
                    throw new ValidationException(['trade' => 'recipient_insufficient_points']);
                }

                // Lock & verify every offered ShopClaim. Each row must currently
                // belong to its declared owner — if the user un-claimed (deleted
                // an upload?) or had ownership flipped by an admin between
                // accept and execute, the trade can't proceed.
                $tradeItems = TradeItem::query()
                    ->where('trade_id', $trade->id)
                    ->lockForUpdate()
                    ->get();

                // For every TradeItem we need two row-locks:
                //   - The DONOR's claim (must exist, quantity >= 1).
                //   - The RECIPIENT's existing claim if any (we'll increment
                //     its quantity instead of running into the UNIQUE key).
                //
                // Claims are stackable (`quantity` column added in migration
                // 2026_05_16_000005). Transfer is "1 unit from donor to
                // recipient" — donor.quantity--, recipient.quantity++ (or
                // insert recipient with quantity=1 when absent).
                $donorClaims = [];     // [tradeItemId => ShopClaim]
                $recipientClaims = []; // [tradeItemId => ?ShopClaim]

                foreach ($tradeItems as $ti) {
                    /** @var ShopClaim|null $donor */
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

                    $newOwnerId = (int) $ti->owner_id === (int) $trade->initiator_id
                        ? (int) $trade->recipient_id
                        : (int) $trade->initiator_id;
                    /** @var ShopClaim|null $recipient */
                    $recipient = ShopClaim::query()
                        ->where('user_id', $newOwnerId)
                        ->where('item_type', $ti->item_type)
                        ->where('item_id', $ti->item_id)
                        ->lockForUpdate()
                        ->first();
                    $recipientClaims[(int) $ti->id] = $recipient; // may be null
                }

            // ── COMMIT ──────────────────────────────────────────────────
            // 1. Move points between balance rows. Lifetime stays put on
            //    BOTH sides — gifting/trading shouldn't inflate the lifetime
            //    metric (that's reserved for forum-action rewards).
            $delta = (int) $trade->recipient_points - (int) $trade->initiator_points;
            $initiatorPoints->balance = (int) $initiatorPoints->balance + $delta;
            $recipientPoints->balance = (int) $recipientPoints->balance - $delta;
            $initiatorPoints->save();
            $recipientPoints->save();

            // 2. Write a PointTransaction row per side for audit. Sign = net
            //    movement; reason carries the trade id for traceability.
            if ($delta !== 0) {
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

            // 3. Transfer 1 unit per TradeItem from donor to recipient.
            //    Donor: quantity-- ; if it falls to 0, delete the row so we
            //    don't leave a zero-quantity ghost in the user's inventory.
            //    Recipient: quantity++ on existing row, or INSERT a fresh
            //    row with quantity=1 if they don't yet own the item.
            //
            //    The `unequip()` handling is left to the frontend / a future
            //    tidy-up — the donor's equipped pointer may now reference a
            //    decoration they no longer own (quantity 0, row deleted);
            //    the equip controller already validates ownership on every
            //    save, so an "equipped but not owned" pointer just renders
            //    nothing on next read.
            foreach ($tradeItems as $ti) {
                $donor = $donorClaims[(int) $ti->id];
                $recipient = $recipientClaims[(int) $ti->id];
                $newOwnerId = (int) $ti->owner_id === (int) $trade->initiator_id
                    ? (int) $trade->recipient_id
                    : (int) $trade->initiator_id;

                $donor->quantity = (int) $donor->quantity - 1;
                if ((int) $donor->quantity <= 0) {
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
                        // price_paid=0 because the recipient didn't spend
                        // points — they received the item via a trade.
                        // The actual point movement is captured in the
                        // PointTransaction rows above.
                        'price_paid' => 0,
                    ]);
                }
            }

            // 4. Mark the trade completed.
            $trade->status = Trade::STATUS_COMPLETED;
            $trade->completed_at = Carbon::now();
            $trade->save();

            // 5. Dispatch event AFTER the transaction commits — actually,
            //    dispatching here is inside the transaction. The listener
            //    sends a notification which talks to NotificationSyncer;
            //    sync runs its own DB writes and shouldn't fail under
            //    normal conditions. If it does throw, the trade rolls back
            //    too — that's the conservative trade-off vs the verified
            //    "notify outside transaction" pattern. We pick rollback
            //    here because half-traded state is worse than a missed
            //    notification.
            $this->events->dispatch(new TradeCompleted($trade));

            return $trade;
            });
        } catch (ValidationException $e) {
            // Transaction has already rolled back at this point — including
            // any `resetAccepts()` we might have called inside it. Run a
            // standalone UPDATE so the trade row reflects "no longer both
            // accepted" and the client's countdown logic doesn't loop on
            // /finalize. The reset is a no-op when the failure mode is
            // `not_both_accepted` (flags were already false going in).
            //
            // We skip the reset for `not_open` because by that point the
            // trade is completed or cancelled — touching the accept flags
            // would muddy the audit trail. Every other validation code
            // (insufficient points, item unavailable, recipient_already_owns_item)
            // is a "fix your offer and try again" condition that warrants
            // re-prompting the user to re-accept.
            $attrs = $e->getAttributes();
            $code = (string) ($attrs['trade'] ?? '');
            if ($code !== '' && $code !== 'not_open') {
                Trade::query()
                    ->where('id', $tradeId)
                    ->update([
                        'initiator_accepted' => false,
                        'recipient_accepted' => false,
                        'updated_at' => Carbon::now(),
                    ]);
            }
            throw $e;
        }
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
        return $this->db->connection()->transaction(function () use ($tradeId, $by) {
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
