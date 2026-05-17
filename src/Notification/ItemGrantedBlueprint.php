<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Notification;

use Flarum\Database\AbstractModel;
use Flarum\Notification\AlertableInterface;
use Flarum\Notification\Blueprint\BlueprintInterface;
use Flarum\User\User;

/**
 * Notification rendered when an admin grants a decoration directly to the
 * recipient. The bell-icon card uses this blueprint's `getData()` to render
 * the gift name + item type — the frontend resolves the type to a copy key
 * so the message reads naturally per family.
 *
 * Per CLAUDE.md §46, `getData()` carries only IDs and primitive scalars —
 * never the full model. The recipient is the subject, so visibility filters
 * on the User model still apply.
 */
class ItemGrantedBlueprint implements BlueprintInterface, AlertableInterface
{
    public const TYPE = 'pointSystemItemGranted';

    public function __construct(
        public User $recipient,
        public ?User $admin,
        public string $itemType,
        public int $itemId,
        public string $itemName,
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
     * IDs + a single short scalar — the admin-curated decoration name is
     * already gated by the manage permission on write, so surfacing it here
     * does not leak anything that wasn't admin-authored to begin with.
     */
    #[\Override]
    public function getData(): mixed
    {
        return [
            'itemType' => $this->itemType,
            'itemId'   => $this->itemId,
            'itemName' => $this->itemName,
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
