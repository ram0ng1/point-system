<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Api\Resource;

use Flarum\Api\Context;
use Flarum\Api\Endpoint;
use Flarum\Api\Resource\AbstractDatabaseResource;
use Flarum\Api\Schema;
use Flarum\Foundation\ValidationException;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Database\Eloquent\Builder;
use Ramon\PointSystem\Model\GroupOffer;

/**
 * @extends AbstractDatabaseResource<GroupOffer>
 */
class GroupOfferResource extends AbstractDatabaseResource
{
    #[\Override]
    public function type(): string
    {
        return 'point-system-group-offers';
    }

    #[\Override]
    public function model(): string
    {
        return GroupOffer::class;
    }

    /**
     * Non-admins only see offers when the auto-group feature is on. Admins keep
     * read access in all cases so they can still configure offers ahead of an
     * enable flip.
     */
    #[\Override]
    public function scope(Builder $query, \Tobyz\JsonApiServer\Context $context): void
    {
        $actor = $context->getActor();
        if ($actor->hasPermission('pointSystem.manage')) {
            return;
        }
        if (! $this->autoGroupEnabled()) {
            $query->whereRaw('1 = 0');
        }
    }

    #[\Override]
    public function endpoints(): array
    {
        return [
            Endpoint\Index::make()->authenticated()->paginate(100, 200),
            Endpoint\Show::make()->authenticated(),
            Endpoint\Create::make()
                ->authenticated()
                ->can('pointSystem.manage')
                ->action(function (Context $context) {
                    $context->getActor()->assertCan('pointSystem.manage');
                    $attrs = (array) ($context->body()['data']['attributes'] ?? []);
                    $offer = new GroupOffer();
                    $this->fill($offer, $attrs);
                    $offer->save();
                    return $offer;
                }),
            Endpoint\Update::make()
                ->authenticated()
                ->can('pointSystem.manage')
                ->action(function (Context $context) {
                    $context->getActor()->assertCan('pointSystem.manage');
                    /** @var GroupOffer $offer */
                    $offer = GroupOffer::query()->findOrFail($context->modelId);
                    $attrs = (array) ($context->body()['data']['attributes'] ?? []);
                    $this->fill($offer, $attrs);
                    $offer->save();
                    return $offer;
                }),
            Endpoint\Delete::make()
                ->authenticated()
                ->can('pointSystem.manage')
                ->action(function (Context $context) {
                    $context->getActor()->assertCan('pointSystem.manage');
                    /** @var GroupOffer $offer */
                    $offer = GroupOffer::query()->findOrFail($context->modelId);
                    $offer->delete();
                    return null;
                }),
        ];
    }

    protected function autoGroupEnabled(): bool
    {
        return (bool) resolve(SettingsRepositoryInterface::class)
            ->get('point-system.auto_group_enabled', true);
    }

    #[\Override]
    public function fields(): array
    {
        return [
            Schema\Integer::make('groupId')->property('group_id'),
            Schema\Integer::make('pointsRequired')->property('points_required'),
            Schema\Integer::make('price')->property('price'),
            Schema\Boolean::make('isAuto')->property('is_auto'),
            Schema\Boolean::make('isPurchasable')->property('is_purchasable'),
            Schema\Boolean::make('isEnabled')->property('is_enabled'),
            Schema\Relationship\ToOne::make('group')
                ->type('groups')
                ->includable(),
        ];
    }

    protected function fill(GroupOffer $offer, array $attrs): void
    {
        if (isset($attrs['groupId'])) {
            $offer->group_id = (int) $attrs['groupId'];
        }
        if (! $offer->group_id) {
            throw new ValidationException(['groupId' => 'Required']);
        }
        if (isset($attrs['pointsRequired'])) {
            $offer->points_required = max(0, (int) $attrs['pointsRequired']);
        }
        if (isset($attrs['price'])) {
            $offer->price = max(0, (int) $attrs['price']);
        }
        if (array_key_exists('isAuto', $attrs)) {
            $offer->is_auto = (bool) $attrs['isAuto'];
        }
        if (array_key_exists('isPurchasable', $attrs)) {
            $offer->is_purchasable = (bool) $attrs['isPurchasable'];
        }
        if (array_key_exists('isEnabled', $attrs)) {
            $offer->is_enabled = (bool) $attrs['isEnabled'];
        }
    }
}
