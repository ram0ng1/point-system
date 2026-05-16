<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Controller;

use Flarum\Foundation\KnownError\RouteNotFoundException;
use Flarum\Foundation\ValidationException;
use Flarum\Http\RequestUtil;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Schema;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\PointSystem\Model\AvatarDecoration;
use Ramon\PointSystem\Model\CoverDecoration;
use Ramon\PointSystem\Model\NameDecoration;
use Ramon\PointSystem\Model\PostHighlightDecoration;
use Ramon\PointSystem\Model\ShopClaim;
use Ramon\PointSystem\Model\TitleDecoration;

/**
 * POST /api/point-system/submissions/{type}/{id}/{action}  (admin only)
 *
 * Single polymorphic endpoint for the admin moderation queue. {action} is
 * one of `approve` | `reject`.
 *
 * Approve: status → approved, is_enabled → true. Admin can then edit the
 * row (set price, configure availability, etc.) via the standard
 * decoration admin panel — approving here just flips the visibility flag
 * so the row enters the public catalog.
 *
 * Reject: status → rejected, is_enabled stays false. The submitter sees
 * their pending submission disappear and a "rejected" entry stays in
 * their personal scope (creator_id) for honesty / audit. Admin can
 * always re-approve later from the same panel.
 *
 * Both actions optionally accept body `{ price?: int }` (approve only)
 * so the admin sets a price in one step rather than approving + editing.
 */
class ModerateSubmissionController implements RequestHandlerInterface
{
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertCan('pointSystem.manage');

        $params = (array) $request->getAttribute('routeParameters', []);
        $type   = (string) ($params['type'] ?? '');
        $id     = (int) ($params['id'] ?? 0);
        $action = (string) ($params['action'] ?? '');

        if (! in_array($type, [
            ShopClaim::TYPE_AVATAR,
            ShopClaim::TYPE_NAME,
            ShopClaim::TYPE_COVER,
            ShopClaim::TYPE_TITLE,
            ShopClaim::TYPE_POST_HL,
        ], true) || $id <= 0) {
            throw new ValidationException(['payload' => 'invalid']);
        }
        if (! in_array($action, ['approve', 'reject'], true)) {
            throw new ValidationException(['action' => 'invalid']);
        }

        $modelClass = match ($type) {
            ShopClaim::TYPE_AVATAR  => AvatarDecoration::class,
            ShopClaim::TYPE_COVER   => CoverDecoration::class,
            ShopClaim::TYPE_TITLE   => TitleDecoration::class,
            ShopClaim::TYPE_POST_HL => PostHighlightDecoration::class,
            default                 => NameDecoration::class,
        };

        // Refuse early when the schema migration is pending — a write here
        // would otherwise hit a 500 with "Unknown column 'status'" and
        // leave the row in a half-updated state if other columns existed.
        $table = (new $modelClass())->getTable();
        if (! Schema::hasColumn($table, 'status')) {
            throw new ValidationException(['migration' => 'Submission columns not yet migrated. Run `php flarum migrate`.']);
        }

        /** @var Model|null $deco */
        $deco = $modelClass::query()->find($id);
        if (! $deco) {
            throw new RouteNotFoundException();
        }

        $body = (array) $request->getParsedBody();

        if ($action === 'approve') {
            $deco->status = 'approved';
            $deco->is_enabled = true;
            if (isset($body['price'])) {
                $deco->price = max(0, (int) $body['price']);
            }
        } else {
            $deco->status = 'rejected';
            $deco->is_enabled = false;
        }
        $deco->save();

        return new JsonResponse([
            'data' => [
                'type'      => $type,
                'id'        => (int) $deco->id,
                'status'    => (string) $deco->status,
                'isEnabled' => (bool) $deco->is_enabled,
                'price'     => (int) $deco->price,
            ],
        ]);
    }
}
