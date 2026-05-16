<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Controller;

use Flarum\Foundation\ValidationException;
use Flarum\Http\RequestUtil;
use Flarum\User\User;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Database\ConnectionInterface;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\PointSystem\Event\TradeRequested;
use Ramon\PointSystem\FeatureGate;
use Ramon\PointSystem\Model\Trade;
use Ramon\PointSystem\Support\TradeSerializer;

/**
 * POST /api/point-system/trades
 * Body: { recipientId: int }
 *
 * Opens a new trade session with another user. The created trade starts in
 * status=pending with both points = 0 and no items, both accepts cleared.
 * The recipient receives a notification so they know the request is waiting.
 *
 * Guards:
 *   - actor must hold `pointSystem.claim` (same permission used to claim
 *     items — keeps the privilege story consistent)
 *   - target must be a real user, NOT the actor themselves
 *   - actor can only have ONE open trade with a given recipient at a time;
 *     a duplicate request returns the existing pending trade so the UI
 *     reopens it instead of spawning sibling rows
 */
class OpenTradeController implements RequestHandlerInterface
{
    public function __construct(
        protected ConnectionInterface $db,
        protected Dispatcher $events,
        protected FeatureGate $features,
    ) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertRegistered();
        // Trade has its own dedicated permission so admins can restrict
        // the feature per group independently of the shop. The master
        // toggle then turns the whole subsystem off forum-wide.
        $this->features->assertTradeEnabled();
        $actor->assertCan('pointSystem.trade');

        $body = (array) $request->getParsedBody();
        $recipientId = (int) ($body['recipientId'] ?? 0);
        if ($recipientId <= 0) {
            throw new ValidationException(['recipientId' => 'required']);
        }
        if ($recipientId === (int) $actor->id) {
            throw new ValidationException(['recipientId' => 'cannot_trade_with_self']);
        }

        $recipient = User::query()->find($recipientId);
        if (! $recipient) {
            throw new ValidationException(['recipientId' => 'user_not_found']);
        }

        $trade = $this->db->transaction(function () use ($actor, $recipient) {
            $a = (int) $actor->id;
            $b = (int) $recipient->id;

            // Pair lookup is symmetric — A→B and B→A are the same conceptual
            // open trade. Whichever side asked first owns the row.
            $existing = Trade::query()
                ->where('status', Trade::STATUS_PENDING)
                ->where(function ($q) use ($a, $b) {
                    $q->where(function ($q2) use ($a, $b) {
                        $q2->where('initiator_id', $a)->where('recipient_id', $b);
                    })->orWhere(function ($q2) use ($a, $b) {
                        $q2->where('initiator_id', $b)->where('recipient_id', $a);
                    });
                })
                ->lockForUpdate()
                ->first();

            if ($existing) {
                return $existing;
            }

            return Trade::create([
                'initiator_id'       => $a,
                'recipient_id'       => $b,
                'initiator_points'   => 0,
                'recipient_points'   => 0,
                'initiator_accepted' => false,
                'recipient_accepted' => false,
                'status'             => Trade::STATUS_PENDING,
            ]);
        });

        // Notify the recipient SYNCHRONOUSLY every time the initiator opens
        // (or re-opens) the trade window. NotificationSyncer skips
        // duplicates against the (recipient, blueprint_type, subject_id)
        // triple, so re-firing on each open never spams the recipient —
        // it's a no-op when the original notification still exists, and a
        // fresh row when the recipient dismissed it but the initiator has
        // returned to follow up.
        //
        // Previously this was gated on `$trade->wasRecentlyCreated`, which
        // meant that a re-opened pending trade NEVER re-notified — the
        // recipient missed the heads-up whenever the initiator returned to
        // a session they'd started earlier (or had dismissed the first
        // alert). The dispatch is synchronous: NotificationSyncer commits
        // the row + fans out to drivers (DB always, websocket when
        // kyrne/websocket is installed) before this method returns, so the
        // recipient sees the alert on their next poll OR immediately via
        // WebSocket if that's wired up.
        $this->events->dispatch(new TradeRequested($trade));

        return new JsonResponse([
            'data' => TradeSerializer::serialize($trade, $actor),
        ], 201);
    }
}
