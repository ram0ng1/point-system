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
use Ramon\PointSystem\Model\AutoGroupTier;

/**
 * @extends AbstractDatabaseResource<AutoGroupTier>
 */
class AutoGroupTierResource extends AbstractDatabaseResource
{
    #[\Override]
    public function type(): string
    {
        return 'point-system-auto-group-tiers';
    }

    #[\Override]
    public function model(): string
    {
        return AutoGroupTier::class;
    }

    /**
     * Hide tiers from non-admin readers when the auto-group system is off.
     * Admins keep access so they can still configure tiers before re-enabling.
     */
    #[\Override]
    public function scope(Builder $query, \Tobyz\JsonApiServer\Context $context): void
    {
        $actor = $context->getActor();
        if ($actor->hasPermission('pointSystem.manage')) {
            return;
        }
        if (! $this->autoGroupEnabled()) {
            $query->whereRaw('1 = 0'); // empty result set
        }
    }

    #[\Override]
    public function endpoints(): array
    {
        return [
            Endpoint\Index::make()->paginate(100, 200),
            Endpoint\Show::make(),
            Endpoint\Create::make()
                ->authenticated()
                ->action(function (Context $context) {
                    $context->getActor()->assertCan('pointSystem.manage');
                    $attrs = (array) ($context->body()['data']['attributes'] ?? []);
                    $tier = new AutoGroupTier();
                    $this->fill($tier, $attrs);
                    $tier->save();
                    return $tier;
                }),
            Endpoint\Update::make()
                ->action(function (Context $context) {
                    $context->getActor()->assertCan('pointSystem.manage');
                    /** @var AutoGroupTier $tier */
                    $tier = AutoGroupTier::query()->findOrFail($context->modelId);
                    $attrs = (array) ($context->body()['data']['attributes'] ?? []);
                    $this->fill($tier, $attrs);
                    $tier->save();
                    return $tier;
                }),
            Endpoint\Delete::make()
                ->action(function (Context $context) {
                    $context->getActor()->assertCan('pointSystem.manage');
                    /** @var AutoGroupTier $tier */
                    $tier = AutoGroupTier::query()->findOrFail($context->modelId);
                    $tier->delete();
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
            Schema\Boolean::make('isEnabled')->property('is_enabled'),
            Schema\Relationship\ToOne::make('group')
                ->type('groups')
                ->includable(),
        ];
    }

    protected function fill(AutoGroupTier $tier, array $attrs): void
    {
        if (isset($attrs['groupId'])) {
            $tier->group_id = (int) $attrs['groupId'];
        }
        if (! $tier->group_id) {
            throw new ValidationException(['groupId' => 'Required']);
        }
        if (isset($attrs['pointsRequired'])) {
            $tier->points_required = max(0, (int) $attrs['pointsRequired']);
        }
        if (isset($attrs['isEnabled'])) {
            $tier->is_enabled = (bool) $attrs['isEnabled'];
        }
    }
}
