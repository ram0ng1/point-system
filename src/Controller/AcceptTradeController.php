<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Controller;

use Flarum\Foundation\KnownError\RouteNotFoundException;
use Flarum\Foundation\ValidationException;
use Flarum\Http\RequestUtil;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Database\ConnectionInterface;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\PointSystem\Event\TradeAccepted;
use Ramon\PointSystem\FeatureGate;
use Ramon\PointSystem\Model\Trade;
use Ramon\PointSystem\Support\TradeSerializer;

/**
 * POST /api/point-system/trades/{id}/accept
 * Body: { accepted?: bool }   // omit to toggle, send explicitly to set
 *
 * Toggles or sets the actor's accept flag. When both sides are accepted the
 * trade stays in `pending` status — execution is deferred to the explicit
 * `POST /trades/{id}/finalize` endpoint, fired by the client AFTER a 5-second
 * visual countdown. That separation gives both participants a chance to
 * un-accept ("oh wait, I made a mistake") before the irreversible transfer
 * runs, and lets the UI show a clear "trade closing in N..." animation
 * instead of the server pulling the rug out from under them.
 */
class AcceptTradeController implements RequestHandlerInterface
{
    public function __construct(
        protected ConnectionInterface $db,
        protected FeatureGate $features,
        protected Dispatcher $events,
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

        $body = (array) $request->getParsedBody();
        $explicit = array_key_exists('accepted', $body);
        $value = $explicit ? (bool) $body['accepted'] : null;

        $tradeId = null;
        // Capture inside the transaction so we can decide AFTER commit
        // whether to dispatch a notification — the event must NOT fire
        // before the row is persisted (a websocket-pushed alert that
        // reads stale `accepted=false` would be wrong).
        $shouldNotifyOtherSide = false;

        $this->db->transaction(function () use ($actor, $id, $explicit, $value, &$tradeId, &$shouldNotifyOtherSide) {
            /** @var Trade|null $trade */
            $trade = Trade::query()->where('id', $id)->lockForUpdate()->first();
            if (! $trade || ! $trade->isParticipant((int) $actor->id)) {
                throw new RouteNotFoundException();
            }
            if (! $trade->isOpen()) {
                throw new ValidationException(['trade' => 'not_open']);
            }

            $isInitiator = (int) $actor->id === (int) $trade->initiator_id;
            $current = $isInitiator ? (bool) $trade->initiator_accepted : (bool) $trade->recipient_accepted;
            $next = $explicit ? $value : ! $current;

            if ($isInitiator) {
                $trade->initiator_accepted = $next;
            } else {
                $trade->recipient_accepted = $next;
            }
            $trade->save();

            $tradeId = (int) $trade->id;

            // Notify the OTHER side only when:
            //   1. This call flipped the actor's accept from false → true
            //      (un-accepts don't generate a notification — they're a
            //      "no, wait" signal, not a "your turn" signal).
            //   2. The trade is NOT now both-accepted. When both are true
            //      the countdown banner is the next user-visible signal;
            //      a "X accepted" notification firing in the same instant
            //      as TradeCompleted would be confusing noise.
            $bothNowAccepted = (bool) $trade->initiator_accepted && (bool) $trade->recipient_accepted;
            $shouldNotifyOtherSide = (! $current && $next === true) && ! $bothNowAccepted;
        });

        $trade = Trade::query()->find($tradeId);

        // Dispatched OUTSIDE the transaction (CLAUDE.md §20: notifications
        // should fire after the DB commit so a half-rolled-back state can
        // never produce a phantom alert). The listener is synchronous —
        // by the time the response goes out, the notifications table has
        // the row and any kyrne/websocket subscribers have been pinged.
        if ($shouldNotifyOtherSide && $trade) {
            $this->events->dispatch(new TradeAccepted($trade, $actor));
        }

        return new JsonResponse([
            'data' => TradeSerializer::serialize($trade, $actor),
        ]);
    }
}
