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
    public const TYPE = 'pointsManual';

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
     * `notification.content()`. The reason text is admin-authored free-text;
     * normalize it to plain UTF-8 and strip control bytes so an admin
     * compromise can't smuggle HTML/JS into the notification card.
     */
    #[\Override]
    public function getData(): mixed
    {
        $reason = $this->reason;
        if (is_string($reason) && $reason !== '') {
            $reason = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $reason) ?? '';
            $reason = mb_substr(trim($reason), 0, 500);
            $reason = htmlspecialchars($reason, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        }
        return [
            'amount' => $this->amount,
            'reason' => $reason,
        ];
    }

    #[\Override]
    public static function getType(): string
    {
        return self::TYPE;
    }

    #[\Override]
    public static function getSubjectModel(): string
    {
        return User::class;
    }
}
