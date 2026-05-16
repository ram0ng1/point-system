<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Listener;

use Flarum\Notification\NotificationSyncer;
use Psr\Log\LoggerInterface;
use Ramon\PointSystem\Event\PointsManuallyChanged;
use Ramon\PointSystem\Notification\PointsManualBlueprint;
use Throwable;

/**
 * Listens for `PointsManuallyChanged` and dispatches the notification to the
 * recipient. Mirrors verified's SendNotificationWhenUserIsVerified pattern:
 * keep the controller thin, do the notification work in a listener.
 *
 * The NotificationSyncer routes through every registered driver — that means
 * the `alert` driver (DB row + bell-icon UI) AND any push driver (e.g.
 * kyrne/websocket if installed). The frontend's websocket listener bumps the
 * unread count and clears the notification list to force a refetch, so the
 * recipient sees it in real time.
 *
 * SELF-EXCLUDE: when the admin is awarding/revoking points on their own
 * account, we skip the notification. Showing a "You gave yourself points"
 * card to the actor that just took the action would be confusing and the
 * marketplace audit (§46.3) recommends this kind of recipient filter.
 *
 * LOGGING: uses PSR-3 LoggerInterface — never the `Illuminate\Support\Facades\Log`
 * facade. CLAUDE.md §41: the facade adds a hidden global dependency, breaks
 * under tests that don't boot the facade root, and obscures the dependency
 * graph. Constructor injection is the supported path.
 */
class SendNotificationWhenPointsChanged
{
    public function __construct(
        protected NotificationSyncer $notifications,
        protected LoggerInterface $logger,
    ) {}

    public function handle(PointsManuallyChanged $event): void
    {
        // Skip self-adjustment — pointless to notify someone of their own action.
        if ($event->admin && (int) $event->admin->id === (int) $event->recipient->id) {
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
            $this->logger->warning('point-system: failed to send points-changed notification', [
                'user_id' => (int) $event->recipient->id,
                'error'   => $e->getMessage(),
            ]);
        }
    }
}
