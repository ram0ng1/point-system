<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Listener;

use Carbon\Carbon;
use Flarum\User\Event\LoggedIn;
use Ramon\PointSystem\Repository\PointsRepository;

/**
 * Credits the configured daily-login bonus the first time a user logs in
 * each calendar day. The check uses `last_daily_bonus_at` on UserPoints so
 * concurrent logins (multiple tabs, mobile + desktop) only ever award once
 * per day — the timestamp is bumped inside the same transaction as the
 * award so a second LoggedIn fires sees the updated row.
 *
 * Limitation: this hooks `LoggedIn` (explicit login), not every session
 * resume. Users with persistent "remember me" cookies who never log out
 * won't accumulate the daily bonus until they re-authenticate. Awarding
 * on every authenticated request would require a per-request DB write
 * which is not worth the cost.
 */
class AwardDailyLoginBonus
{
    public function __construct(protected PointsRepository $points) {}

    public function handle(LoggedIn $event): void
    {
        $amount = $this->points->settingInt('point-system.daily_login_bonus', 0);
        if ($amount <= 0) {
            return;
        }

        $user = $event->user;
        $row = $this->points->getOrCreate($user);

        $today = Carbon::now()->startOfDay();
        if ($row->last_daily_bonus_at !== null && $row->last_daily_bonus_at->greaterThanOrEqualTo($today)) {
            return;
        }

        // Stamp first so a racing second login (same request? unlikely, but
        // also covers a quick re-login) hits the guard above. The award call
        // below runs in its own transaction.
        $row->last_daily_bonus_at = Carbon::now();
        $row->save();

        $this->points->award(
            $user,
            $amount,
            'user.daily_login',
            'user',
            $user->id,
        );
    }
}
