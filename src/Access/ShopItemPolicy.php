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

    /**
     * Catch-all bypass: any ability resolves to allow when the actor holds
     * the system-wide manage permission. Specific methods above run first
     * (AbstractPolicy::checkAbility) — this only fires if they returned null.
     */
    public function can(User $actor): ?bool
    {
        return $actor->hasPermission('pointSystem.manage') ? true : null;
    }
}
