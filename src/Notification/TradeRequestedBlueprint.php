<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Notification;

use Flarum\Database\AbstractModel;
use Flarum\Notification\AlertableInterface;
use Flarum\Notification\Blueprint\BlueprintInterface;
use Flarum\User\User;
use Ramon\PointSystem\Model\Trade;

/**
 * "X wants to trade with you" — sent to the recipient of a fresh trade
 * request. `data` carries only the trade id; the frontend uses that to
 * deep-link back into the trade modal when the user clicks the card.
 *
 * Subject is the recipient User (per CLAUDE.md §46 — subject_type stays
 * stable across the family). The frontend resolves the trade id from
 * `getData()` for navigation.
 */
class TradeRequestedBlueprint implements BlueprintInterface, AlertableInterface
{
    public function __construct(
        public User $recipient,
        public User $initiator,
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
        return $this->initiator;
    }

    #[\Override]
    public function getData(): mixed
    {
        return ['tradeId' => $this->tradeId];
    }

    #[\Override]
    public static function getType(): string
    {
        return 'pointSystemTradeRequested';
    }

    #[\Override]
    public static function getSubjectModel(): string
    {
        return User::class;
    }
}
