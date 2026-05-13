<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Access;

use Flarum\User\Access\AbstractPolicy;
use Flarum\User\User;

class ShopItemPolicy extends AbstractPolicy
{
    public function view(User $actor): ?bool
    {
        return $actor->hasPermission('pointSystem.viewShop') ? true : null;
    }

    public function manage(User $actor): ?bool
    {
        return $actor->hasPermission('pointSystem.manage') ? true : null;
    }
}
