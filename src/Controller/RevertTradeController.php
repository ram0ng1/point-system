<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Controller;

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
 * POST /api/point-system/admin/trades/{id}/revert
 *
 * Admin-only revert of a completed trade. Refunds the points movement and
 * flips ShopClaim ownership back to the original owners. Refuses (422)
 * with `item_re_traded` if any item has moved on since the trade — the
 * admin then handles those edge cases manually via award/grant.
 *
 * Permission: `pointSystem.manage` — same gate as the AllTrades read view.
 */
class RevertTradeController implements RequestHandlerInterface
{
    public function __construct(
        protected TradeRepository $trades,
    ) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertCan('pointSystem.manage');

        $id = (int) ($request->getAttribute('routeParameters', [])['id'] ?? 0);
        if ($id <= 0) {
            throw new ValidationException(['id' => 'invalid']);
        }

        try {
            $trade = $this->trades->revert($id, $actor);
        } catch (ValidationException $e) {
            $current = Trade::query()->find($id);
            return new JsonResponse([
                'data'   => $current ? TradeSerializer::serialize($current, null) : null,
                'errors' => [[
                    'code'   => 'revert_failed',
                    'detail' => json_encode($e->getAttributes(), JSON_UNESCAPED_UNICODE),
                ]],
            ], 422);
        }

        return new JsonResponse([
            'data' => TradeSerializer::serialize($trade, null),
        ]);
    }
}
