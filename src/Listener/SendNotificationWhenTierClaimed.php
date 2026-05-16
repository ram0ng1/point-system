<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Listener;

use Flarum\Notification\NotificationSyncer;
use Psr\Log\LoggerInterface;
use Ramon\PointSystem\Event\TierClaimed;
use Ramon\PointSystem\Notification\TierClaimedBlueprint;
use Throwable;

/**
 * Listens for `TierClaimed` and dispatches the notification to the user that
 * just joined the group. NotificationSyncer fan-outs to every driver — the
 * websocket driver (kyrne/websocket) pushes a Pusher event on the user's
 * private channel so the bell-icon refreshes in real time.
 *
 * PSR-3 LoggerInterface is injected directly — never via the
 * Illuminate\Support\Facades\Log facade. See CLAUDE.md §41.
 */
class SendNotificationWhenTierClaimed
{
    public function __construct(
        protected NotificationSyncer $notifications,
        protected LoggerInterface $logger,
    ) {}

    public function handle(TierClaimed $event): void
    {
        try {
            $this->notifications->sync(
                new TierClaimedBlueprint($event->user, $event->group, $event->pointsRequired),
                [$event->user],
            );
        } catch (Throwable $e) {
            $this->logger->warning('point-system: failed to send tier-claimed notification', [
                'user_id'  => (int) $event->user->id,
                'group_id' => (int) $event->group->id,
                'error'    => $e->getMessage(),
            ]);
        }
    }
}
