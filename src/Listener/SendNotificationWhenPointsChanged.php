<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Listener;

use Flarum\Notification\NotificationSyncer;
use Illuminate\Support\Facades\Log;
use Ramon\PointSystem\Event\PointsManuallyChanged;
use Ramon\PointSystem\Notification\PointsManualBlueprint;
use Throwable;

/**
 * Listens for `PointsManuallyChanged` and dispatches the notification to the
 * recipient. Mirrors verified's SendNotificationWhenUserIsVerified pattern:
 * keep the controller thin, do the notification work async-ish in a listener.
 *
 * The NotificationSyncer routes through every registered driver — that means
 * the `alert` driver (DB row + bell-icon UI) AND the kyrne/websocket driver
 * (Pusher push to `private-user{id}`) fire in one call. The frontend's
 * websocket listener bumps the unread count and clears the notification list
 * to force a refetch, so the recipient sees it in real time.
 */
class SendNotificationWhenPointsChanged
{
    public function __construct(
        protected NotificationSyncer $notifications,
    ) {}

    public function handle(PointsManuallyChanged $event): void
    {
        // Skip self-adjustment — pointless to notify someone of their own action.
        if ($event->admin && $event->admin->id === $event->recipient->id) {
            return;
        }

        try {
            $this->notifications->sync(
                new PointsManualBlueprint(
                    $event->recipient,
                    $event->admin,
                    $event->amount,
                    $event->reason,
                ),
                [$event->recipient],
            );
        } catch (Throwable $e) {
            Log::warning('point-system: failed to send points-changed notification', [
                'user_id' => (int) $event->recipient->id,
                'error'   => $e->getMessage(),
            ]);
        }
    }
}
