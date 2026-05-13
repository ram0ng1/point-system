<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Api;

use Flarum\Api\Context;
use Flarum\Api\Schema;
use Flarum\User\User;
use Ramon\PointSystem\Model\AvatarDecoration;
use Ramon\PointSystem\Model\NameDecoration;
use Ramon\PointSystem\Model\ShopClaim;
use Ramon\PointSystem\Model\UserPoints;

class UserFields
{
    public function __invoke(): array
    {
        return [
            Schema\Integer::make('pointBalance')
                ->visible(fn (User $user, Context $context) => $this->canSeePoints($user, $context))
                ->get(fn (User $user) => $this->points($user)?->balance ?? 0),

            Schema\Integer::make('pointLifetime')
                ->visible(fn (User $user, Context $context) => $this->canSeePoints($user, $context))
                ->get(fn (User $user) => $this->points($user)?->lifetime ?? 0),

            Schema\Integer::make('equippedAvatarDecorationId')
                ->nullable()
                ->get(fn (User $user) => $this->points($user)?->current_avatar_decoration_id),

            Schema\Str::make('equippedAvatarDecorationUrl')
                ->nullable()
                ->get(function (User $user): ?string {
                    $p = $this->points($user);
                    if (! $p || ! $p->current_avatar_decoration_id) {
                        return null;
                    }
                    $deco = AvatarDecoration::find($p->current_avatar_decoration_id);
                    if (! $deco) {
                        return null;
                    }
                    return $deco->image_path;
                }),

            Schema\Integer::make('equippedNameDecorationId')
                ->nullable()
                ->get(fn (User $user) => $this->points($user)?->current_name_decoration_id),

            Schema\Str::make('equippedNameDecorationSlug')
                ->nullable()
                ->get(function (User $user): ?string {
                    $p = $this->points($user);
                    if (! $p || ! $p->current_name_decoration_id) {
                        return null;
                    }
                    $deco = NameDecoration::find($p->current_name_decoration_id);
                    return $deco?->slug;
                }),

            Schema\Arr::make('ownedDecorationIds')
                ->visible(function (User $user, Context $context) {
                    return $context->getActor()->id === $user->id;
                })
                ->get(function (User $user) {
                    return ShopClaim::where('user_id', $user->id)
                        ->get(['item_type', 'item_id'])
                        ->map(fn ($c) => ['type' => $c->item_type, 'id' => $c->item_id])
                        ->toArray();
                }),
        ];
    }

    protected function points(User $user): ?UserPoints
    {
        return UserPoints::firstOrCreate(
            ['user_id' => $user->id],
            ['balance' => 0, 'lifetime' => 0],
        );
    }

    /**
     * The owner always sees their own points. Managers always do.
     * Everyone else (including guests) only sees them if the admin granted
     * the `pointSystem.viewOthers` permission to their group.
     */
    protected function canSeePoints(User $user, Context $context): bool
    {
        $actor = $context->getActor();
        if ($actor->id && $actor->id === $user->id) {
            return true;
        }
        if ($actor->hasPermission('pointSystem.manage')) {
            return true;
        }
        return $actor->hasPermission('pointSystem.viewOthers');
    }
}
