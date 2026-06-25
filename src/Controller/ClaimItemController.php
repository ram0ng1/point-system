<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Controller;

use Flarum\Http\RequestUtil;
use Illuminate\Database\ConnectionInterface;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\PointSystem\FeatureGate;
use Ramon\PointSystem\Model\ShopClaim;
use Ramon\PointSystem\Model\UserPoints;
use Ramon\PointSystem\Repository\PointsRepository;
use Ramon\PointSystem\Support\ItemAvailability;
use Ramon\PointSystem\Support\ShopItemLocator;

/**
 * POST /api/point-system/claim/{id}
 * Body: { type: "avatar_decoration" | "name_decoration" | ... }
 *
 * Spends points and creates / increments a claim row. Each call charges
 * the item's full price and adds 1 to the user's `quantity` for that
 * (item_type, item_id) — claims are STACKABLE, so a user can own N copies
 * of the same decoration. This is what makes trade transfers safe: the
 * recipient's existing claim is incremented instead of colliding with the
 * UNIQUE (user_id, item_type, item_id) key.
 *
 * Enforces ALL of:
 *   - feature gate (type-family on/off)
 *   - item is_enabled
 *   - availability window (available_from / available_until)
 *   - max_claims (hard cap on total claims across all users)
 *   - allowed_group_ids (claimer must belong to one of the listed groups)
 *
 * The availability checks happen inside the same transaction as the deduct +
 * claim-row creation so a parallel claim can't race past max_claims.
 */
class ClaimItemController implements RequestHandlerInterface
{
    public function __construct(
        protected PointsRepository $points,
        protected ConnectionInterface $db,
        protected FeatureGate $features,
    ) {}

    #[\Override]
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertRegistered();
        $actor->assertCan('pointSystem.claim');

        $params = (array) $request->getAttribute('routeParameters', []);
        $id     = (int) ($params['id'] ?? 0);
        $body   = (array) $request->getParsedBody();
        $type = $body['type'] ?? null;

        if (! in_array($type, [
            ShopClaim::TYPE_AVATAR,
            ShopClaim::TYPE_NAME,
            ShopClaim::TYPE_COVER,
            ShopClaim::TYPE_TITLE,
            ShopClaim::TYPE_POST_HL,
        ], true) || $id <= 0) {
            return new JsonResponse(['errors' => [['detail' => 'Invalid item']]], 422);
        }

        $this->features->assertEnabled($type);

        try {
            [$claim, $alreadyOwned] = $this->db->transaction(function () use ($actor, $type, $id) {
                // Lock the user's points row so a sibling request blocks here.
                UserPoints::where('user_id', $actor->id)->lockForUpdate()->first();

                // Fetch and lock the ITEM row too — max_claims enforcement
                // requires we read claim_count under a row lock so a parallel
                // claim can't race past the cap.
                $item = ShopItemLocator::lock($type, $id);
                if (! $item) {
                    return [null, false];
                }

                $existing = ShopClaim::where('user_id', $actor->id)
                    ->where('item_type', $type)
                    ->where('item_id', $id)
                    ->lockForUpdate()
                    ->first();

                // Availability gate — runs under the item row-lock so the
                // max_claims read is consistent with the increment below.
                // Re-check even on a stacking re-purchase: dates, groups,
                // and the global cap can change between buys.
                $reason = ItemAvailability::reasonNotClaimable($item, $actor);
                if ($reason !== null) {
                    throw new \DomainException($reason);
                }

                // Charge the price for THIS copy. Claims are stackable, so a
                // re-purchase is a fresh transaction (not idempotent), and
                // each copy increments `claim_count` toward the global cap.
                $this->points->deduct($actor, (int) $item->price, 'shop.claim', $type, $id);

                if ($existing) {
                    $existing->quantity = (int) $existing->quantity + 1;
                    $existing->save();
                    $claim = $existing;
                    $wasExisting = true;
                } else {
                    $claim = ShopClaim::create([
                        'user_id' => $actor->id,
                        'item_type' => $type,
                        'item_id' => $id,
                        'quantity' => 1,
                        'price_paid' => (int) $item->price,
                    ]);
                    $wasExisting = false;
                }

                // Increment claim_count atomically. We've already held the row
                // lock above so this is a guaranteed-in-order update.
                $item->claim_count = (int) $item->claim_count + 1;
                $item->save();

                return [$claim, $wasExisting];
            });
        } catch (\DomainException $e) {
            $code = $e->getMessage();
            // Tanto os códigos de disponibilidade (`expired`, `sold_out`,
            // `group_restricted`, `not_yet_available`, `disabled`) quanto
            // saldo-insuficiente são 422 (Unprocessable Entity). O ternário
            // anterior `... ? 422 : 422` era dead code (relato de auditoria
            // 2026-05-24); um `match`/`if` sobre código semanticamente
            // diferente não muda o status — quem distingue é o `code` no
            // payload, que o frontend usa pra escolher a chave de tradução.
            return new JsonResponse([
                'errors' => [[
                    'code'   => $code === 'Insufficient point balance' ? 'insufficient_balance' : $code,
                    'detail' => $code,
                ]],
            ], 422);
        }

        if (! $claim) {
            return new JsonResponse(['errors' => [['detail' => 'Item not available']]], 404);
        }

        return new JsonResponse(['data' => $claim->toApiResource()], $alreadyOwned ? 200 : 201);
    }
}
