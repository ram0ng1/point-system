<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Controller;

use Carbon\Carbon;
use Flarum\Foundation\KnownError\RouteNotFoundException;
use Flarum\Foundation\ValidationException;
use Flarum\Http\RequestUtil;
use Illuminate\Database\ConnectionResolverInterface;
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
        protected ConnectionResolverInterface $db,
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

        $trade = $this->db->connection()->transaction(function () use ($actor, $id, $rawPoints, $rawItems) {
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
                    // duration while the offer is verified.
                    throw new ValidationException(['items' => 'too_many']);
                }

                // Validate + normalize every entry first — no DB hits in this
                // loop. The composite (type|id) key also collapses an offer
                // that lists the same decoration twice; the schema's UNIQUE
                // key forbids a true duplicate anyway.
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
                    $normalized[$type.'|'.$itemId] = ['itemType' => $type, 'itemId' => $itemId];
                }
                $normalized = array_values($normalized);
                $itemIds = array_map(static fn ($r) => $r['itemId'], $normalized);

                // Verify ownership for the WHOLE offer in one query, then
                // check each pair against the result set (CLAUDE.md §38.1/§38.5).
                if ($normalized !== []) {
                    $ownedSet = array_flip(
                        ShopClaim::query()
                            ->where('user_id', $actor->id)
                            ->whereIn('item_id', $itemIds)
                            ->get(['item_type', 'item_id'])
                            ->map(static fn ($c) => $c->item_type.'|'.$c->item_id)
                            ->all()
                    );
                    foreach ($normalized as $row) {
                        if (! isset($ownedSet[$row['itemType'].'|'.$row['itemId']])) {
                            throw new ValidationException(['items' => 'not_owned']);
                        }
                    }
                }

                // Drop the actor's existing entries and re-insert the new
                // set. We do NOT touch the opposing side's rows.
                TradeItem::query()
                    ->where('trade_id', $trade->id)
                    ->where('owner_id', $actor->id)
                    ->delete();

                if ($normalized !== []) {
                    // One query for the opposing side's remaining rows. The
                    // UNIQUE (trade_id, item_type, item_id) key forbids the
                    // same decoration appearing on both sides — surface a
                    // clean error instead of letting the batch insert throw.
                    $otherSideSet = array_flip(
                        TradeItem::query()
                            ->where('trade_id', $trade->id)
                            ->whereIn('item_id', $itemIds)
                            ->get(['item_type', 'item_id'])
                            ->map(static fn ($it) => $it->item_type.'|'.$it->item_id)
                            ->all()
                    );
                    foreach ($normalized as $row) {
                        if (isset($otherSideSet[$row['itemType'].'|'.$row['itemId']])) {
                            throw new ValidationException(['items' => 'duplicate_with_other_side']);
                        }
                    }

                    $now = Carbon::now();
                    TradeItem::query()->insert(array_map(static fn ($row) => [
                        'trade_id'   => $trade->id,
                        'owner_id'   => $actor->id,
                        'item_type'  => $row['itemType'],
                        'item_id'    => $row['itemId'],
                        'created_at' => $now,
                        'updated_at' => $now,
                    ], $normalized));
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
