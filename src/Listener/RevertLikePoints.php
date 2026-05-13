<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Listener;

use Ramon\PointSystem\Repository\PointsRepository;

class RevertLikePoints
{
    public function __construct(protected PointsRepository $points) {}

    public function handle($event): void
    {
        $post = $event->post;
        $liker = $event->user;

        if ($post->user && $post->user->id !== $liker->id) {
            $this->points->revert($post->user, 'like.received', 'post', $post->id);
        }
        $this->points->revert($liker, 'like.given', 'post', $post->id);
    }
}
