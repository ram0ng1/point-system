<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Listener;

use Flarum\Notification\NotificationSyncer;
use Psr\Log\LoggerInterface;
use Ramon\PointSystem\Event\TradeAccepted;
use Ramon\PointSystem\Notification\TradeAcceptedBlueprint;
use Throwable;

/**
 * Listens for {@see TradeAccepted} and pings the OTHER participant so they
 * see "X accepted your trade" in their notification bell even when their
 * trade modal was closed at the time of the accept.
 *
 * The dispatching controller only fires this event when:
 *   - the accept flag transitioned from false → true (not on un-accept), AND
 *   - the trade is NOT now both-accepted (we let TradeCompleted carry that
 *     message after finalize so there's no "X accepted" + "trade completed"
 *     burst on the same screen).
 *
 * Failure isolation: any throw from NotificationSyncer is caught and
 * logged. A failed notification must NOT roll back the accept flag — the
 * server-side state is the source of truth; the alert is best-effort.
 */
class SendNotificationWhenTradeAccepted
{
    public function __construct(
        protected NotificationSyncer $notifications,
        protected LoggerInterface $logger,
    ) {}

    public function handle(TradeAccepted $event): void
    {
        $trade = $event->trade;
        $trade->loadMissing(['initiator', 'recipient']);

        $accepter = $event->acceptedBy;
        $otherSide = (int) $accepter->id === (int) $trade->initiator_id
            ? $trade->recipient
            : $trade->initiator;

        if (! $otherSide || ! $accepter) return;
        if ((int) $accepter->id === (int) $otherSide->id) return; // defensive

        try {
            $this->notifications->sync(
                new TradeAcceptedBlueprint($otherSide, $accepter, (int) $trade->id),
                [$otherSide],
            );
        } catch (Throwable $e) {
            $this->logger->warning('point-system: failed to send trade-accepted notification', [
                'trade_id' => (int) $trade->id,
                'error'    => $e->getMessage(),
            ]);
        }
    }
}
