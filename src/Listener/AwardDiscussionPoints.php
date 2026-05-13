<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Listener;

use Flarum\Discussion\Event\Started;
use Ramon\PointSystem\Repository\PointsRepository;

class AwardDiscussionPoints
{
    public function __construct(protected PointsRepository $points) {}

    public function handle(Started $event): void
    {
        $amount = $this->points->settingInt('point-system.points_per_discussion', 10);
        if ($amount <= 0 || ! $event->discussion->user) {
            return;
        }

        $this->points->award(
            $event->discussion->user,
            $amount,
            'discussion.started',
            'discussion',
            $event->discussion->id,
        );
    }
}
