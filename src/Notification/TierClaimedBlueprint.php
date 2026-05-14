<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Notification;

use Flarum\Database\AbstractModel;
use Flarum\Group\Group;
use Flarum\Notification\AlertableInterface;
use Flarum\Notification\Blueprint\BlueprintInterface;
use Flarum\User\User;

/**
 * Blueprint fired when a user claims (or is auto-promoted into) a group tier
 * by accumulating enough lifetime points. Subject is the Group they joined;
 * `getData()` carries the lifetime threshold so the frontend can include it
 * in the notification copy ("You joined the Veterans group · 5000 points").
 */
class TierClaimedBlueprint implements BlueprintInterface, AlertableInterface
{
    public function __construct(
        public User $recipient,
        public Group $group,
        public int $pointsRequired = 0,
    ) {}

    #[\Override]
    public function getSubject(): ?AbstractModel
    {
        return $this->group;
    }

    #[\Override]
    public function getFromUser(): ?User
    {
        return null;
    }

    #[\Override]
    public function getData(): mixed
    {
        return [
            'groupName' => $this->group->name_plural ?: $this->group->name_singular,
            'groupColor' => $this->group->color,
            'groupIcon' => $this->group->icon,
            'pointsRequired' => $this->pointsRequired,
        ];
    }

    #[\Override]
    public static function getType(): string
    {
        return 'pointSystemTierClaimed';
    }

    #[\Override]
    public static function getSubjectModel(): string
    {
        return Group::class;
    }
}
