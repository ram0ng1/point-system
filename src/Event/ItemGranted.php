<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Event;

use Flarum\Database\AbstractModel;
use Flarum\User\User;

/**
 * Fired by {@see \Ramon\PointSystem\Controller\GrantItemController} when an
 * admin hands a shop item directly to a user (bypassing the public catalog,
 * the price, the listing flag, etc.). A listener picks this up and sends an
 * alert-level notification so the recipient knows the gift is in their
 * inventory and can equip it.
 *
 * `$item` is the resolved decoration model (Avatar / Name / Cover / Title /
 * PostHighlight) — kept polymorphic so the listener can read the human-
 * readable name without re-querying.
 */
class ItemGranted
{
    public function __construct(
        public User $recipient,
        public ?User $admin,
        public string $itemType,
        public AbstractModel $item,
    ) {}
}
