<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Event;

use Flarum\Group\Group;
use Flarum\User\User;

/**
 * Fired when a user gets attached to a group via the auto-tier system —
 * either by clicking "Claim" on the Rewards page or by auto-promotion from
 * the syncAutoGroups() routine. One event per group attached.
 */
class TierClaimed
{
    public function __construct(
        public User $user,
        public Group $group,
        public int $pointsRequired = 0,
    ) {}
}
