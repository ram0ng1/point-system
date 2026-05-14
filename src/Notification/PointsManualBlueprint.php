<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Notification;

use Flarum\Database\AbstractModel;
use Flarum\Notification\AlertableInterface;
use Flarum\Notification\Blueprint\BlueprintInterface;
use Flarum\User\User;

/**
 * Blueprint fired when an admin manually adjusts a user's points — either
 * crediting (add) or debiting (remove). The amount is signed: positive for
 * "added", negative for "removed". Frontend renders different copy based on
 * sign. Auto-awarded points (post/discussion/like events) do NOT fire this
 * — only the explicit admin action from the Manage Points modal does.
 */
class PointsManualBlueprint implements BlueprintInterface, AlertableInterface
{
    public function __construct(
        public User $recipient,
        public ?User $admin,
        public int $amount,
        public ?string $reason = null,
    ) {}

    #[\Override]
    public function getSubject(): ?AbstractModel
    {
        return $this->recipient;
    }

    #[\Override]
    public function getFromUser(): ?User
    {
        return $this->admin;
    }

    /**
     * Stored as JSON on the notification row and surfaced to the frontend via
     * `notification.content()`. Both fields are read by the Mithril component.
     */
    #[\Override]
    public function getData(): mixed
    {
        return [
            'amount' => $this->amount,
            'reason' => $this->reason,
        ];
    }

    #[\Override]
    public static function getType(): string
    {
        return 'pointsManual';
    }

    #[\Override]
    public static function getSubjectModel(): string
    {
        return User::class;
    }
}
