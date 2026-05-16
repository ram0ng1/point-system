<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Controller;

use Flarum\Http\RequestUtil;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\PointSystem\Model\Trade;
use Ramon\PointSystem\Support\TradeSerializer;

/**
 * GET /api/point-system/admin/trades (admin only)
 *
 * Admin view of every trade in the system, newest first. Companion to
 * `ListTradesController` which scopes to the actor's own trades — this
 * one is global and gated on `pointSystem.manage`.
 *
 * Paginated via `?offset=` + `?limit=` (default 50, capped at 200). The
 * frontend AllTradesPanel renders one row per trade with both party names,
 * status, and timestamps; clicking a pending row could open the
 * TradeRepository-backed admin view later but for now it's read-only.
 */
class ListAllTradesController implements RequestHandlerInterface
{
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertCan('pointSystem.manage');

        $query = (array) $request->getQueryParams();
        $offset = max(0, (int) ($query['offset'] ?? 0));
        $limit = min(200, max(1, (int) ($query['limit'] ?? 50)));
        $status = (string) ($query['status'] ?? '');

        $builder = Trade::query()
            ->with(['initiator', 'recipient', 'items'])
            ->orderByDesc('updated_at');

        if (in_array($status, [Trade::STATUS_PENDING, Trade::STATUS_COMPLETED, Trade::STATUS_CANCELLED], true)) {
            $builder->where('status', $status);
        }

        $total = (clone $builder)->count();

        $trades = $builder->offset($offset)->limit($limit)->get();

        // We serialize each trade with `actor = null` — the youAre side
        // shape doesn't apply on the admin view (admin isn't a participant
        // unless they happen to be one too). Frontend renders both sides
        // by their party fields directly.
        return new JsonResponse([
            'data'  => $trades->map(fn (Trade $t) => TradeSerializer::serialize($t, null))->values()->toArray(),
            'meta'  => [
                'total'  => (int) $total,
                'offset' => $offset,
                'limit'  => $limit,
            ],
        ]);
    }
}
