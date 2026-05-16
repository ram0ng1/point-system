<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Listener;

use Flarum\Notification\NotificationSyncer;
use Psr\Log\LoggerInterface;
use Ramon\PointSystem\Event\TradeRequested;
use Ramon\PointSystem\Notification\TradeRequestedBlueprint;
use Throwable;

class SendNotificationWhenTradeRequested
{
    public function __construct(
        protected NotificationSyncer $notifications,
        protected LoggerInterface $logger,
    ) {}

    public function handle(TradeRequested $event): void
    {
        $trade = $event->trade;
        $trade->loadMissing(['initiator', 'recipient']);

        $initiator = $trade->initiator;
        $recipient = $trade->recipient;
        if (! $initiator || ! $recipient) return;

        // Defensive self-exclude (the controller already blocks self-trades).
        if ((int) $initiator->id === (int) $recipient->id) return;

        try {
            $this->notifications->sync(
                new TradeRequestedBlueprint($recipient, $initiator, (int) $trade->id),
                [$recipient],
            );
        } catch (Throwable $e) {
            $this->logger->warning('point-system: failed to send trade-requested notification', [
                'trade_id' => (int) $trade->id,
                'error'    => $e->getMessage(),
            ]);
        }
    }
}
