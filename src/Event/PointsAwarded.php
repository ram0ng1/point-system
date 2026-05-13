<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Event;

use Flarum\User\User;

class PointsAwarded
{
    public function __construct(
        public User $user,
        public int $amount,
        public string $reason,
    ) {}
}
