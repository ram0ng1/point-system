<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Controller;

use Flarum\Foundation\KnownError\RouteNotFoundException;
use Flarum\Foundation\ValidationException;
use Flarum\Http\RequestUtil;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\PointSystem\Model\Trade;
use Ramon\PointSystem\Repository\TradeRepository;
use Ramon\PointSystem\Support\TradeSerializer;

/**
 * POST /api/point-system/trades/{id}/cancel
 *
 * Either participant can cancel a pending trade at any time. Idempotent —
 * cancelling an already-cancelled / already-completed trade returns its
 * current state without error.
 */
class CancelTradeController implements RequestHandlerInterface
{
    public function __construct(
        protected TradeRepository $trades,
    ) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertRegistered();

        $id = (int) ($request->getAttribute('routeParameters', [])['id'] ?? 0);
        if ($id <= 0) {
            throw new ValidationException(['id' => 'invalid']);
        }

        $trade = Trade::query()->find($id);
        if (! $trade || ! $trade->isParticipant((int) $actor->id)) {
            throw new RouteNotFoundException();
        }

        $trade = $this->trades->cancel($trade, $actor);

        return new JsonResponse([
            'data' => TradeSerializer::serialize($trade, $actor),
        ]);
    }
}
