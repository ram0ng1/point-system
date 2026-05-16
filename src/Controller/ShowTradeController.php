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
use Ramon\PointSystem\Support\TradeSerializer;

/**
 * GET /api/point-system/trades/{id}
 *
 * Returns one trade by id IF the actor is a participant. Non-participants
 * get a 404 (not 403) — leaking "this trade exists but you're not part of
 * it" would let users enumerate other people's trade IDs.
 */
class ShowTradeController implements RequestHandlerInterface
{
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

        return new JsonResponse([
            'data' => TradeSerializer::serialize($trade, $actor),
        ]);
    }
}
