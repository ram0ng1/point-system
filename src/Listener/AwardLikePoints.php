<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Listener;

use Ramon\PointSystem\Repository\PointsRepository;

class AwardLikePoints
{
    public function __construct(protected PointsRepository $points) {}

    public function handle($event): void
    {
        $post = $event->post;
        $liker = $event->user;

        $received = $this->points->settingInt('point-system.points_per_like_received', 2);
        $given    = $this->points->settingInt('point-system.points_per_like_given', 1);

        // Author gets points (skip self-likes if same user)
        if ($received > 0 && $post->user && $post->user->id !== $liker->id) {
            $this->points->award(
                $post->user,
                $received,
                'like.received',
                'post',
                $post->id,
                ['liker_id' => $liker->id],
            );
        }

        // Liker gets points
        if ($given > 0 && $post->user && $post->user->id !== $liker->id) {
            $this->points->award(
                $liker,
                $given,
                'like.given',
                'post',
                $post->id,
            );
        }
    }
}
