<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Notification;

use Flarum\Database\AbstractModel;
use Flarum\Notification\AlertableInterface;
use Flarum\Notification\Blueprint\BlueprintInterface;
use Flarum\User\User;

/**
 * "X accepted your trade — accept yours to finalise" — sent to the side
 * of the trade that has NOT yet accepted, when their counter-party flips
 * `*_accepted` to true.
 *
 * Subject is the recipient User (same pattern as TradeRequested /
 * TradeCompleted — the notification syncer fans out per subject, and we
 * instantiate one blueprint per recipient). `data.tradeId` lets the
 * frontend deep-link back into the trade modal when the recipient clicks.
 */
class TradeAcceptedBlueprint implements BlueprintInterface, AlertableInterface
{
    public const TYPE = 'pointSystemTradeAccepted';

    public function __construct(
        public User $recipient,
        public User $acceptedBy,
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
        return $this->acceptedBy;
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
