<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Controller;

use Flarum\Http\RequestUtil;
use Illuminate\Database\ConnectionInterface;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\PointSystem\Model\AvatarDecoration;
use Ramon\PointSystem\Model\NameDecoration;
use Ramon\PointSystem\Model\ShopClaim;
use Ramon\PointSystem\Model\UserPoints;
use Ramon\PointSystem\Repository\PointsRepository;

/**
 * POST /api/point-system/claim/{id}
 * Body: { type: "avatar_decoration" | "name_decoration" }
 *
 * Spends points and creates a claim row. Idempotent — re-claiming an already
 * owned item returns the existing claim without re-charging.
 */
class ClaimItemController implements RequestHandlerInterface
{
    public function __construct(
        protected PointsRepository $points,
        protected ConnectionInterface $db,
    ) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertRegistered();
        $actor->assertCan('pointSystem.claim');

        $params = (array) $request->getAttribute('routeParameters', []);
        $id     = (int) ($params['id'] ?? 0);
        $body   = (array) $request->getParsedBody();
        $type = $body['type'] ?? null;

        if (! in_array($type, [ShopClaim::TYPE_AVATAR, ShopClaim::TYPE_NAME], true) || $id <= 0) {
            return new JsonResponse(['errors' => [['detail' => 'Invalid item']]], 422);
        }

        $item = $type === ShopClaim::TYPE_AVATAR
            ? AvatarDecoration::find($id)
            : NameDecoration::find($id);

        if (! $item || ! $item->is_enabled) {
            return new JsonResponse(['errors' => [['detail' => 'Item not available']]], 404);
        }

        // The "already owned?" check and the deduct-then-create-claim flow run
        // inside a single transaction with an exclusive row lock on the user's
        // points row. This closes the TOCTOU window where two parallel POSTs
        // both pass the existence check, both deduct, and both create claim
        // rows (charging the user twice for one logical purchase).
        try {
            [$claim, $alreadyOwned] = $this->db->transaction(function () use ($actor, $type, $id, $item) {
                // Lock the user's points row so a sibling request blocks here.
                UserPoints::where('user_id', $actor->id)->lockForUpdate()->first();

                $existing = ShopClaim::where('user_id', $actor->id)
                    ->where('item_type', $type)
                    ->where('item_id', $id)
                    ->lockForUpdate()
                    ->first();
                if ($existing) {
                    return [$existing, true];
                }

                // deduct() opens its own (nested) transaction — fine on
                // ConnectionInterface; nested transactions are merged via
                // savepoint semantics on the same connection.
                $this->points->deduct($actor, (int) $item->price, 'shop.claim', $type, $id);

                $claim = ShopClaim::create([
                    'user_id' => $actor->id,
                    'item_type' => $type,
                    'item_id' => $id,
                    'price_paid' => (int) $item->price,
                ]);
                return [$claim, false];
            });
        } catch (\DomainException $e) {
            return new JsonResponse([
                'errors' => [['code' => 'insufficient_balance', 'detail' => $e->getMessage()]],
            ], 422);
        }

        return new JsonResponse(['data' => $this->serialize($claim)], $alreadyOwned ? 200 : 201);
    }

    protected function serialize(ShopClaim $claim): array
    {
        return [
            'type' => 'point-system-claims',
            'id' => (string) $claim->id,
            'attributes' => [
                'itemType' => $claim->item_type,
                'itemId' => $claim->item_id,
                'pricePaid' => $claim->price_paid,
                'claimedAt' => optional($claim->claimed_at)->toIso8601String(),
            ],
        ];
    }
}
