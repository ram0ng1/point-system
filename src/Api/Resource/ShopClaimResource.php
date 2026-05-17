<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Api\Resource;

use Flarum\Api\Endpoint;
use Flarum\Api\Resource\AbstractDatabaseResource;
use Flarum\Api\Schema;
use Illuminate\Database\Eloquent\Builder;
use Ramon\PointSystem\Model\ShopClaim;

/**
 * @extends AbstractDatabaseResource<ShopClaim>
 */
class ShopClaimResource extends AbstractDatabaseResource
{
    #[\Override]
    public function type(): string
    {
        return 'point-system-claims';
    }

    #[\Override]
    public function model(): string
    {
        return ShopClaim::class;
    }

    #[\Override]
    public function scope(Builder $query, \Tobyz\JsonApiServer\Context $context): void
    {
        $actor = $context->getActor();
        if ($actor->isGuest()) {
            $query->whereRaw('1 = 0');
            return;
        }
        if (! $actor->hasPermission('pointSystem.manage')) {
            $query->where('user_id', (int) $actor->id);
        }
    }

    #[\Override]
    public function endpoints(): array
    {
        return [
            Endpoint\Index::make()->authenticated()->paginate(50, 200),
            Endpoint\Show::make()->authenticated(),
        ];
    }

    #[\Override]
    public function fields(): array
    {
        return [
            Schema\Integer::make('userId')->property('user_id'),
            Schema\Str::make('itemType')->property('item_type'),
            Schema\Integer::make('itemId')->property('item_id'),
            Schema\Integer::make('pricePaid')->property('price_paid'),
            Schema\DateTime::make('claimedAt')->property('claimed_at'),
        ];
    }
}
