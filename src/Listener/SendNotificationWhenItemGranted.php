<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Listener;

use Flarum\Notification\NotificationSyncer;
use Psr\Log\LoggerInterface;
use Ramon\PointSystem\Event\ItemGranted;
use Ramon\PointSystem\Notification\ItemGrantedBlueprint;
use Throwable;

/**
 * Listens for {@see ItemGranted} and dispatches the alert/notification to
 * the recipient. Mirrors the SendNotificationWhenPointsChanged pattern:
 * controller stays thin, the notification work happens here.
 *
 * Self-grants (admin granting themselves an item) are skipped — confused-
 * looking notifications "<you> sent <you> a gift" add noise without value.
 * Stays consistent with the same self-exclude rule on PointsManuallyChanged.
 */
class SendNotificationWhenItemGranted
{
    public function __construct(
        protected NotificationSyncer $notifications,
        protected LoggerInterface $logger,
    ) {}

    public function handle(ItemGranted $event): void
    {
        if ($event->admin && (int) $event->admin->id === (int) $event->recipient->id) {
            return;
        }

        try {
            $this->notifications->sync(
                new ItemGrantedBlueprint(
                    $event->recipient,
                    $event->admin,
                    $event->itemType,
                    (int) ($event->item->id ?? 0),
                    (string) ($event->item->name ?? ''),
                ),
                [$event->recipient],
            );
        } catch (Throwable $e) {
            $this->logger->warning('point-system: failed to send item-granted notification', [
                'user_id' => (int) $event->recipient->id,
                'error'   => $e->getMessage(),
            ]);
        }
    }
}
