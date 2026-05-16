<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Controller;

use Flarum\Http\RequestUtil;
use Flarum\User\User;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Database\Eloquent\Model;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\PointSystem\Event\ItemGranted;
use Ramon\PointSystem\FeatureGate;
use Ramon\PointSystem\Model\AvatarDecoration;
use Ramon\PointSystem\Model\CoverDecoration;
use Ramon\PointSystem\Model\NameDecoration;
use Ramon\PointSystem\Model\PostHighlightDecoration;
use Ramon\PointSystem\Model\ShopClaim;
use Ramon\PointSystem\Model\TitleDecoration;

/**
 * POST /api/point-system/grant (admin only)
 * Body: { type, itemId, userId, ignoreLimit?: bool }
 *
 * Lets an admin hand a decoration to a specific user directly — used for
 * "hidden" frames (is_listed=false) that don't appear in the public shop,
 * or for handing a sold-out item to a special user.
 *
 * Differences from the user-driven ClaimItemController:
 *   - Bypasses price (no balance deduction).
 *   - Bypasses is_listed (the whole point is granting hidden items).
 *   - Bypasses available_from/until (admins manage timing themselves).
 *   - Bypasses allowed_group_ids (admin decides who gets the gift).
 *   - Respects max_claims by default; admin can override with ignoreLimit.
 *   - Still increments claim_count so the running tally stays honest.
 *
 * Stackable: each grant adds 1 to the recipient's `quantity` for that
 * (item_type, item_id). Re-granting an item the user already owns is NOT
 * idempotent anymore — it stacks another copy onto the existing claim.
 * The notification fires on every grant so the recipient knows they got
 * another one.
 */
class GrantItemController implements RequestHandlerInterface
{
    public function __construct(
        protected ConnectionInterface $db,
        protected FeatureGate $features,
        protected Dispatcher $events,
    ) {}

    #[\Override]
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertCan('pointSystem.manage');

        $body = (array) $request->getParsedBody();
        $type = (string) ($body['type'] ?? '');
        $itemId = (int) ($body['itemId'] ?? 0);
        $userId = (int) ($body['userId'] ?? 0);
        $ignoreLimit = (bool) ($body['ignoreLimit'] ?? false);

        if (! in_array($type, [
            ShopClaim::TYPE_AVATAR,
            ShopClaim::TYPE_NAME,
            ShopClaim::TYPE_COVER,
            ShopClaim::TYPE_TITLE,
            ShopClaim::TYPE_POST_HL,
        ], true) || $itemId <= 0 || $userId <= 0) {
            return new JsonResponse(['errors' => [['detail' => 'Invalid payload']]], 422);
        }

        $this->features->assertEnabled($type);

        $recipient = User::query()->find($userId);
        if (! $recipient) {
            return new JsonResponse(['errors' => [['detail' => 'User not found']]], 404);
        }

        $grantedItem = null;

        try {
            [$claim, $alreadyOwned, $grantedItem] = $this->db->transaction(function () use ($recipient, $type, $itemId, $ignoreLimit) {
                $item = $this->lockItem($type, $itemId);
                if (! $item) {
                    throw new \DomainException('not_found');
                }

                $existing = ShopClaim::where('user_id', $recipient->id)
                    ->where('item_type', $type)
                    ->where('item_id', $itemId)
                    ->lockForUpdate()
                    ->first();

                // The admin pathway IGNORES is_listed, dates and groups. The
                // only thing we still respect is max_claims unless explicitly
                // overridden — it would be confusing if an item said
                // "5 available, 5 claimed" but actually had 6 holders.
                if (! $ignoreLimit) {
                    $max = $item->max_claims ?? null;
                    if (is_int($max) && $max > 0 && (int) ($item->claim_count ?? 0) >= $max) {
                        throw new \DomainException('sold_out');
                    }
                }

                if ($existing) {
                    $existing->quantity = (int) $existing->quantity + 1;
                    $existing->save();
                    $claim = $existing;
                    $wasExisting = true;
                } else {
                    $claim = ShopClaim::create([
                        'user_id' => $recipient->id,
                        'item_type' => $type,
                        'item_id' => $itemId,
                        'quantity' => 1,
                        // price_paid=0 records that this was a free grant — the
                        // user didn't spend points. Audit-visible in PointTransaction
                        // history (we don't log a transaction row for free grants).
                        'price_paid' => 0,
                    ]);
                    $wasExisting = false;
                }

                $item->claim_count = (int) $item->claim_count + 1;
                $item->save();

                return [$claim, $wasExisting, $item];
            });
        } catch (\DomainException $e) {
            $code = $e->getMessage();
            if ($code === 'not_found') {
                return new JsonResponse(['errors' => [['detail' => 'Item not found']]], 404);
            }
            return new JsonResponse([
                'errors' => [[
                    'code'   => $code,
                    'detail' => $code,
                ]],
            ], 422);
        }

        // Notification — fires on EVERY grant now that claims are stackable.
        // A repeat grant means "you got another copy"; the recipient should
        // know. The listener guards against admin==recipient self-grants.
        // We dispatch OUTSIDE the transaction so a failing notifier (mailer
        // down, queue offline, etc.) never rolls back the grant — same
        // discipline as SendNotificationWhenUserIsVerified (CLAUDE.md §46).
        if ($grantedItem) {
            $this->events->dispatch(new ItemGranted($recipient, $actor, $type, $grantedItem));
        }

        return new JsonResponse(['data' => $this->serialize($claim)], $alreadyOwned ? 200 : 201);
    }

    protected function lockItem(string $type, int $id): ?Model
    {
        $query = match ($type) {
            ShopClaim::TYPE_AVATAR  => AvatarDecoration::query(),
            ShopClaim::TYPE_COVER   => CoverDecoration::query(),
            ShopClaim::TYPE_TITLE   => TitleDecoration::query(),
            ShopClaim::TYPE_POST_HL => PostHighlightDecoration::query(),
            default                 => NameDecoration::query(),
        };
        return $query->where('id', $id)->lockForUpdate()->first();
    }

    protected function serialize(ShopClaim $claim): array
    {
        return [
            'type' => 'point-system-claims',
            'id' => (string) $claim->id,
            'attributes' => [
                'itemType' => $claim->item_type,
                'itemId' => $claim->item_id,
                'quantity' => (int) $claim->quantity,
                'pricePaid' => $claim->price_paid,
                'claimedAt' => optional($claim->claimed_at)->toIso8601String(),
            ],
        ];
    }
}
