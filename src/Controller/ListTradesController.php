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
 * GET /api/point-system/trades
 *
 * Returns every trade the actor is a participant of. Pending trades come
 * first, then completed/cancelled (capped — we don't paginate; the typical
 * "active trades" list is tiny). Frontend uses this for the trade-inbox
 * popup and for re-opening a pending trade after page reload.
 */
class ListTradesController implements RequestHandlerInterface
{
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertRegistered();

        // Two-pass to avoid MySQL-only ORDER BY FIELD (CLAUDE.md §39.2).
        // Pending first (typically 0-3 rows), then a capped history tail.
        // `items`/`initiator`/`recipient` are eager-loaded here so the
        // TradeSerializer's loadMissing() is a no-op — otherwise it fires
        // 3 queries per trade (CLAUDE.md §38.1).
        $pending = Trade::query()
            ->with(['items', 'initiator', 'recipient'])
            ->where(function ($q) use ($actor) {
                $q->where('initiator_id', $actor->id)->orWhere('recipient_id', $actor->id);
            })
            ->where('status', Trade::STATUS_PENDING)
            ->orderByDesc('updated_at')
            ->limit(25)
            ->get();

        $history = Trade::query()
            ->with(['items', 'initiator', 'recipient'])
            ->where(function ($q) use ($actor) {
                $q->where('initiator_id', $actor->id)->orWhere('recipient_id', $actor->id);
            })
            ->where('status', '!=', Trade::STATUS_PENDING)
            ->orderByDesc('updated_at')
            ->limit(25)
            ->get();

        $trades = $pending->concat($history);

        return new JsonResponse([
            'data' => $trades->map(fn (Trade $t) => TradeSerializer::serialize($t, $actor))->values()->toArray(),
        ]);
    }
}
