<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Notification;

use Flarum\Database\AbstractModel;
use Flarum\Notification\AlertableInterface;
use Flarum\Notification\Blueprint\BlueprintInterface;
use Flarum\User\User;
use Ramon\PointSystem\Model\Trade;

/**
 * "Your trade with X is complete" — sent to BOTH participants after a
 * successful trade execution. Each side gets one notification with the
 * other party set as `fromUser` so the bell-card reads "X traded with you".
 *
 * Subject is the recipient User (the notification syncer fans out per
 * user, so we instantiate one blueprint per recipient with their counter-
 * party as `fromUser`).
 */
class TradeCompletedBlueprint implements BlueprintInterface, AlertableInterface
{
    public const TYPE = 'pointSystemTradeCompleted';

    public function __construct(
        public User $recipient,
        public User $counterparty,
        public int $tradeId,
    ) {}

    #[\Override]
    public function getSubject(): ?AbstractModel
    {
        return $this->recipient;
    }

    #[\Override]
    public function getFromUser(): ?User
    {
        return $this->counterparty;
    }

    #[\Override]
    public function getData(): mixed
    {
        return ['tradeId' => $this->tradeId];
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
