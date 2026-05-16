<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Controller;

use Flarum\Foundation\KnownError\RouteNotFoundException;
use Flarum\Foundation\ValidationException;
use Flarum\Http\RequestUtil;
use Illuminate\Database\ConnectionInterface;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\PointSystem\FeatureGate;
use Ramon\PointSystem\Model\ShopClaim;
use Ramon\PointSystem\Model\Trade;
use Ramon\PointSystem\Model\TradeItem;
use Ramon\PointSystem\Model\UserPoints;
use Ramon\PointSystem\Support\TradeSerializer;

/**
 * PATCH /api/point-system/trades/{id}
 * Body: { points?: int, items?: [{ itemType, itemId }, ...] }
 *
 * Updates the actor's side of the trade. Replaces the items list and the
 * offered points wholesale — partial diffs would complicate the lock model
 * for no real UX gain (the trade window already has full client state).
 *
 * Side-effects:
 *   - Validates every offered item is currently owned by the actor.
 *   - Validates the offered point count is non-negative and not larger
 *     than the actor's current balance.
 *   - Resets BOTH accept flags. Any change to either side's offer
 *     invalidates a prior agreement (Habbo-style flow).
 *
 * Concurrency: lock the Trade row and the actor's UserPoints row up-front
 * so two parallel updates can't both pass the balance check.
 */
class UpdateTradeOfferController implements RequestHandlerInterface
{
    public function __construct(
        protected ConnectionInterface $db,
        protected FeatureGate $features,
    ) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertRegistered();
        $this->features->assertTradeEnabled();

        $id = (int) ($request->getAttribute('routeParameters', [])['id'] ?? 0);
        if ($id <= 0) {
            throw new ValidationException(['id' => 'invalid']);
        }

        $body = (array) $request->getParsedBody();
        $rawPoints = $body['points'] ?? null;
        $rawItems  = $body['items']  ?? null;

        $trade = $this->db->transaction(function () use ($actor, $id, $rawPoints, $rawItems) {
            /** @var Trade|null $trade */
            $trade = Trade::query()->where('id', $id)->lockForUpdate()->first();
            if (! $trade || ! $trade->isParticipant((int) $actor->id)) {
                throw new RouteNotFoundException();
            }
            if (! $trade->isOpen()) {
                throw new ValidationException(['trade' => 'not_open']);
            }

            $isInitiator = (int) $actor->id === (int) $trade->initiator_id;

            // ── Points ──
            if ($rawPoints !== null) {
                $points = max(0, (int) $rawPoints);

                $balanceRow = UserPoints::query()
                    ->where('user_id', $actor->id)
                    ->lockForUpdate()
                    ->first();
                $balance = (int) ($balanceRow->balance ?? 0);
                if ($points > $balance) {
                    throw new ValidationException(['points' => 'insufficient_points']);
                }

                if ($isInitiator) {
                    $trade->initiator_points = $points;
                } else {
                    $trade->recipient_points = $points;
                }
            }

            // ── Items ── replace-all semantics for this side only.
            if ($rawItems !== null) {
                if (! is_array($rawItems)) {
                    throw new ValidationException(['items' => 'invalid']);
                }
                if (count($rawItems) > 12) {
                    // Cap to keep the modal tidy; also protects the lock
                    // duration when every item is verified individually.
                    throw new ValidationException(['items' => 'too_many']);
                }

                // Verify ownership for every requested item BEFORE writing
                // anything — the validator wins or the whole update aborts.
                $normalized = [];
                foreach ($rawItems as $row) {
                    if (! is_array($row)) {
                        throw new ValidationException(['items' => 'invalid_entry']);
                    }
                    $type = (string) ($row['itemType'] ?? '');
                    $itemId = (int) ($row['itemId'] ?? 0);
                    if ($type === '' || $itemId <= 0) {
                        throw new ValidationException(['items' => 'invalid_entry']);
                    }
                    if (! in_array($type, [
                        ShopClaim::TYPE_AVATAR,
                        ShopClaim::TYPE_NAME,
                        ShopClaim::TYPE_COVER,
                        ShopClaim::TYPE_TITLE,
                        ShopClaim::TYPE_POST_HL,
                    ], true)) {
                        throw new ValidationException(['items' => 'invalid_type']);
                    }

                    $owned = ShopClaim::query()
                        ->where('user_id', $actor->id)
                        ->where('item_type', $type)
                        ->where('item_id', $itemId)
                        ->exists();
                    if (! $owned) {
                        throw new ValidationException(['items' => 'not_owned']);
                    }

                    $normalized[] = ['itemType' => $type, 'itemId' => $itemId];
                }

                // Drop the actor's existing entries and re-insert the new
                // set. We do NOT touch the opposing side's rows.
                TradeItem::query()
                    ->where('trade_id', $trade->id)
                    ->where('owner_id', $actor->id)
                    ->delete();

                foreach ($normalized as $row) {
                    // `firstOrCreate`-style guard: the UNIQUE (trade_id,
                    // item_type, item_id) constraint will reject a row that
                    // the OTHER side already offered. Surface a clean error
                    // instead of letting the DB throw.
                    $alreadyOnTable = TradeItem::query()
                        ->where('trade_id', $trade->id)
                        ->where('item_type', $row['itemType'])
                        ->where('item_id', $row['itemId'])
                        ->exists();
                    if ($alreadyOnTable) {
                        throw new ValidationException(['items' => 'duplicate_with_other_side']);
                    }
                    TradeItem::create([
                        'trade_id'  => $trade->id,
                        'owner_id'  => $actor->id,
                        'item_type' => $row['itemType'],
                        'item_id'   => $row['itemId'],
                    ]);
                }
            }

            // Any change to either side's offer drops both accepts —
            // that's the Habbo trade rule. We always reset here; if the
            // caller wants to "just accept", they hit /accept instead.
            $trade->initiator_accepted = false;
            $trade->recipient_accepted = false;
            $trade->save();

            return $trade->fresh(['items']);
        });

        return new JsonResponse([
            'data' => TradeSerializer::serialize($trade, $actor),
        ]);
    }
}
