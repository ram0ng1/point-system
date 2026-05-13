<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Event;

use Flarum\User\User;

/**
 * Fired when an admin manually adds or removes points from a user via the
 * "Manage points" modal (or the admin panel's award form). The amount is
 * signed: positive = added, negative = removed. Listeners — including the
 * notification dispatcher and any future audit log — pick this up and react.
 */
class PointsManuallyChanged
{
    public function __construct(
        public User $recipient,
        public ?User $admin,
        public int $amount,
        public ?string $reason = null,
    ) {}
}
