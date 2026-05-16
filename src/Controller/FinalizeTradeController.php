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
use Ramon\PointSystem\FeatureGate;
use Ramon\PointSystem\Model\Trade;
use Ramon\PointSystem\Repository\TradeRepository;
use Ramon\PointSystem\Support\TradeSerializer;

/**
 * POST /api/point-system/trades/{id}/finalize
 *
 * Executes a trade that has both `initiator_accepted` and `recipient_accepted`.
 * Called by the client AFTER the 5-second countdown ends — separating the
 * accept toggle from the irreversible transfer gives users a visual
 * "closing in N..." pre-roll where either side can un-accept and bail.
 *
 * Idempotent: if the trade is already completed (e.g., the OTHER side's
 * client finalized first — both clients run the countdown independently
 * and race to call this endpoint), return the current state without
 * re-executing. Polling does this naturally too.
 *
 * Refuses (422) when:
 *   - Trade isn't pending (already completed by a competing client, or
 *     cancelled). For 'completed' we return 200 + current state (idempotent
 *     success); for 'cancelled' we error so the UI can show the cancellation
 *     banner.
 *   - Either side has un-accepted between countdown start and finalize call.
 *
 * No anti-replay timestamp guard — execute() locks the row first and
 * re-validates both `accepted` flags, so a stale finalize call after one
 * side un-accepts fails at the repository level with `not_both_accepted`.
 */
class FinalizeTradeController implements RequestHandlerInterface
{
    public function __construct(
        protected TradeRepository $trades,
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

        $trade = Trade::query()->find($id);
        if (! $trade || ! $trade->isParticipant((int) $actor->id)) {
            throw new RouteNotFoundException();
        }

        // Idempotent on already-completed: both clients ran the countdown
        // and raced; first wins, second arrives here and sees the trade
        // already done. Return success + current state so the second
        // client's UI flips to the success banner without an error.
        if ($trade->status === Trade::STATUS_COMPLETED) {
            return new JsonResponse([
                'data' => TradeSerializer::serialize($trade, $actor),
            ]);
        }

        try {
            $trade = $this->trades->execute($id);
        } catch (ValidationException $e) {
            $current = Trade::query()->find($id);
            return new JsonResponse([
                'data'   => $current ? TradeSerializer::serialize($current, $actor) : null,
                'errors' => [[
                    'code'   => 'execute_failed',
                    'detail' => json_encode($e->getAttributes(), JSON_UNESCAPED_UNICODE),
                ]],
            ], 422);
        }

        return new JsonResponse([
            'data' => TradeSerializer::serialize($trade, $actor),
        ]);
    }
}
