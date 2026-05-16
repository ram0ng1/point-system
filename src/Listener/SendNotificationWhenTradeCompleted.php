<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Listener;

use Flarum\Notification\NotificationSyncer;
use Psr\Log\LoggerInterface;
use Ramon\PointSystem\Event\TradeCompleted;
use Ramon\PointSystem\Notification\TradeCompletedBlueprint;
use Throwable;

/**
 * Fires one notification per participant when a trade commits.
 *
 * Each blueprint carries the counterparty as `fromUser`, so the bell card
 * reads "X traded with you" on either side. We use `try/catch` per recipient
 * — a failure on one notification shouldn't suppress the other.
 */
class SendNotificationWhenTradeCompleted
{
    public function __construct(
        protected NotificationSyncer $notifications,
        protected LoggerInterface $logger,
    ) {}

    public function handle(TradeCompleted $event): void
    {
        $trade = $event->trade;
        $trade->loadMissing(['initiator', 'recipient']);

        $initiator = $trade->initiator;
        $recipient = $trade->recipient;
        if (! $initiator || ! $recipient) return;

        foreach ([
            [$initiator, $recipient],
            [$recipient, $initiator],
        ] as [$me, $other]) {
            try {
                $this->notifications->sync(
                    new TradeCompletedBlueprint($me, $other, (int) $trade->id),
                    [$me],
                );
            } catch (Throwable $e) {
                $this->logger->warning('point-system: failed to send trade-completed notification', [
                    'trade_id'   => (int) $trade->id,
                    'recipient'  => (int) $me->id,
                    'error'      => $e->getMessage(),
                ]);
            }
        }
    }
}
