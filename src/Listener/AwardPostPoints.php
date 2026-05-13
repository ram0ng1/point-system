<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Listener;

use Flarum\Post\CommentPost;
use Flarum\Post\Event\Posted;
use Ramon\PointSystem\Repository\PointsRepository;

class AwardPostPoints
{
    public function __construct(protected PointsRepository $points) {}

    public function handle(Posted $event): void
    {
        $post = $event->post;
        if (! $post instanceof CommentPost) {
            return;
        }

        // Skip the OP — the discussion-started listener already credited it.
        if ($post->number === 1) {
            return;
        }

        $amount = $this->points->settingInt('point-system.points_per_post', 5);
        if ($amount <= 0 || ! $post->user) {
            return;
        }

        $this->points->award(
            $post->user,
            $amount,
            'post.posted',
            'post',
            $post->id,
        );
    }
}
