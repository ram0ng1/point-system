<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Listener;

use Flarum\User\Event\Registered;
use Ramon\PointSystem\Repository\PointsRepository;

class InitUserPoints
{
    public function __construct(protected PointsRepository $points) {}

    public function handle(Registered $event): void
    {
        $amount = $this->points->settingInt('point-system.points_per_registration', 50);
        $this->points->getOrCreate($event->user);

        if ($amount > 0) {
            $this->points->award(
                $event->user,
                $amount,
                'user.registered',
                'user',
                $event->user->id,
            );
        }
    }
}
