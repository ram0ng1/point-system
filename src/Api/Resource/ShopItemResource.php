<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Api\Resource;

use Flarum\Api\Endpoint;
use Flarum\Api\Resource\AbstractDatabaseResource;
use Flarum\Api\Schema;
use Illuminate\Database\Eloquent\Builder;
use Ramon\PointSystem\Model\AvatarDecoration;

/**
 * Unified "shop catalog" view. Currently mirrors the avatar decorations because
 * the forum frontend already pulls both avatar+name decorations from the
 * forum payload — this resource exists mainly so admin tooling has a stable
 * `point-system-shop-items` type to target and so future item types (badges,
 * banners) can be folded in here without breaking clients.
 *
 * @extends AbstractDatabaseResource<AvatarDecoration>
 */
class ShopItemResource extends AbstractDatabaseResource
{
    public function type(): string
    {
        return 'point-system-shop-items';
    }

    public function model(): string
    {
        return AvatarDecoration::class;
    }

    public function scope(Builder $query, \Tobyz\JsonApiServer\Context $context): void
    {
        $actor = $context->getActor();
        if (! $actor->hasPermission('pointSystem.manage')) {
            $query->where('is_enabled', true);
        }
    }

    public function endpoints(): array
    {
        return [
            Endpoint\Index::make()->paginate(100, 200),
            Endpoint\Show::make(),
        ];
    }

    public function fields(): array
    {
        return [
            Schema\Str::make('name'),
            Schema\Str::make('description')->nullable(),
            Schema\Str::make('imagePath')->property('image_path'),
            Schema\Boolean::make('isAnimated')->property('is_animated'),
            Schema\Integer::make('price'),
            Schema\Boolean::make('isEnabled')->property('is_enabled'),
        ];
    }
}
