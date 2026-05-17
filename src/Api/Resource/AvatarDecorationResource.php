<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Api\Resource;

use Flarum\Api\Context;
use Flarum\Api\Endpoint;
use Flarum\Api\Resource\AbstractDatabaseResource;
use Flarum\Api\Schema;
use Flarum\Api\Sort\SortColumn;
use Flarum\Foundation\ValidationException;
use Illuminate\Database\Eloquent\Builder;
use Ramon\PointSystem\FeatureGate;
use Ramon\PointSystem\Model\AvatarDecoration;
use Ramon\PointSystem\Model\ShopClaim;
use Ramon\PointSystem\Support\ItemAvailability;
use Ramon\PointSystem\Support\RemoteImageUrl;
use Ramon\PointSystem\Support\SubmissionScope;

/**
 * @extends AbstractDatabaseResource<AvatarDecoration>
 */
class AvatarDecorationResource extends AbstractDatabaseResource
{
    // No constructor: Flarum core's ApiServiceProvider populates routes via
    // `(new ReflectionClass)->newInstanceWithoutConstructor()`, so any
    // constructor-injected dependency is uninitialized when `endpoints()`
    // runs. The documented pattern is to resolve services lazily inside
    // action callbacks.

    #[\Override]
    public function type(): string
    {
        return 'point-system-avatar-decorations';
    }

    #[\Override]
    public function model(): string
    {
        return AvatarDecoration::class;
    }

    #[\Override]
    public function scope(Builder $query, \Tobyz\JsonApiServer\Context $context): void
    {
        $actor = $context->getActor();
        if (! $actor->hasPermission('pointSystem.manage')) {
            if (! resolve(FeatureGate::class)->isEnabled(ShopClaim::TYPE_AVATAR)) {
                $query->whereRaw('1 = 0');
                return;
            }
            $query->where('is_enabled', true);
            SubmissionScope::apply($query, $actor);
            ItemAvailability::applyShopScope($query, $actor);
        }
    }

    #[\Override]
    public function endpoints(): array
    {
        return [
            Endpoint\Index::make()->paginate(100, 200)->eagerLoad('creator'),
            Endpoint\Show::make()->eagerLoad('creator'),

            Endpoint\Create::make()
                ->authenticated()
                ->action(function (Context $context) {
                    $actor     = $context->getActor();
                    $features  = resolve(FeatureGate::class);
                    $isManager = $actor->hasPermission('pointSystem.manage');

                    $features->assertEnabled(ShopClaim::TYPE_AVATAR);
                    if (! $isManager) {
                        $features->assertUserSubmissionsEnabled();
                    }

                    $attrs = (array) ($context->body()['data']['attributes'] ?? []);
                    $deco = new AvatarDecoration();
                    $this->fill($deco, $attrs, isNew: true, byManager: $isManager);

                    if (! $isManager) {
                        if (empty($deco->image_url)) {
                            throw new ValidationException(['imageUrl' => 'User submissions must include an image URL']);
                        }
                        $deco->image_path = null;
                        $deco->creator_id = (int) $actor->id;
                        $deco->status = AvatarDecoration::STATUS_PENDING;
                        $deco->is_enabled = false;
                        $deco->price = 0;
                    }

                    $deco->save();
                    return $deco;
                }),

            Endpoint\Update::make()
                ->authenticated()
                ->can('manage')
                ->action(function (Context $context) {
                    resolve(FeatureGate::class)->assertEnabled(ShopClaim::TYPE_AVATAR);
                    /** @var AvatarDecoration $deco */
                    $deco = AvatarDecoration::query()->findOrFail($context->modelId);
                    $attrs = (array) ($context->body()['data']['attributes'] ?? []);
                    $this->fill($deco, $attrs, byManager: true);
                    $deco->save();
                    return $deco;
                }),

            Endpoint\Delete::make()
                ->authenticated()
                ->can('manage')
                ->action(function (Context $context) {
                    resolve(FeatureGate::class)->assertEnabled(ShopClaim::TYPE_AVATAR);
                    /** @var AvatarDecoration $deco */
                    $deco = AvatarDecoration::query()->findOrFail($context->modelId);
                    $deco->delete();
                    return null;
                }),
        ];
    }

    #[\Override]
    public function fields(): array
    {
        $managerOnly = fn (AvatarDecoration $d, \Flarum\Api\Context $context) =>
            $context->getActor()->hasPermission('pointSystem.manage');
        $managerOrCreator = fn (AvatarDecoration $d, \Flarum\Api\Context $context) =>
            $context->getActor()->hasPermission('pointSystem.manage')
            || (int) $context->getActor()->id === (int) $d->creator_id;

        return array_merge([
            Schema\Str::make('name')->writable(),
            Schema\Str::make('description')->nullable()->writable(),
            Schema\Str::make('imagePath')->property('image_path')->nullable(),
            Schema\Str::make('imageUrl')->property('image_url')->nullable()->writable(),
            Schema\Boolean::make('isAnimated')->property('is_animated')->writable($managerOnly),
            Schema\Integer::make('price')->writable($managerOnly),
            Schema\Boolean::make('isEnabled')->property('is_enabled')->writable($managerOnly),
            Schema\Integer::make('sort')->writable($managerOnly),
            Schema\DateTime::make('createdAt')->property('created_at'),
            Schema\Str::make('status')->writable($managerOnly),
            Schema\Integer::make('creatorId')->property('creator_id')->nullable()
                ->visible($managerOrCreator),
            Schema\Str::make('creatorUsername')
                ->visible($managerOrCreator)
                ->get(fn (AvatarDecoration $d) => optional($d->creator)->username),
        ], AvailabilityFields::fields());
    }

    #[\Override]
    public function sorts(): array
    {
        return [
            SortColumn::make('sort'),
            SortColumn::make('price'),
            SortColumn::make('createdAt')->column('created_at'),
        ];
    }

    protected function fill(AvatarDecoration $deco, array $attrs, bool $isNew = false, bool $byManager = true): void
    {
        if ($isNew || isset($attrs['name'])) {
            $name = trim((string) ($attrs['name'] ?? $deco->name ?? ''));
            if ($name === '') {
                throw new ValidationException(['name' => 'Required']);
            }
            $deco->name = mb_substr($name, 0, 100);
        }
        if (array_key_exists('description', $attrs)) {
            $deco->description = $attrs['description'] !== null
                ? mb_substr(trim((string) $attrs['description']), 0, 500)
                : null;
        }
        if (array_key_exists('imageUrl', $attrs)) {
            $raw = $attrs['imageUrl'];
            if ($raw === null || $raw === '') {
                $deco->image_url = null;
            } else {
                $validated = RemoteImageUrl::validate((string) $raw);
                if ($validated === null) {
                    throw new ValidationException(['imageUrl' => 'Invalid image URL']);
                }
                $deco->image_url = $validated;
                $ext = strtolower(pathinfo(parse_url($validated, PHP_URL_PATH) ?? '', PATHINFO_EXTENSION));
                if (in_array($ext, ['gif', 'apng', 'webp'], true)) {
                    $deco->is_animated = true;
                }
            }
        }

        if ($byManager) {
            if (array_key_exists('isAnimated', $attrs)) {
                $deco->is_animated = (bool) $attrs['isAnimated'];
            }
            if (isset($attrs['price'])) {
                $deco->price = max(0, (int) $attrs['price']);
            }
            if (isset($attrs['isEnabled'])) {
                $deco->is_enabled = (bool) $attrs['isEnabled'];
            }
            if (isset($attrs['sort'])) {
                $deco->sort = (int) $attrs['sort'];
            }
            if (isset($attrs['status']) && in_array($attrs['status'], [
                AvatarDecoration::STATUS_APPROVED,
                AvatarDecoration::STATUS_PENDING,
                AvatarDecoration::STATUS_REJECTED,
            ], true)) {
                $deco->status = (string) $attrs['status'];
            }
            ItemAvailability::fillFromAttrs($deco, $attrs);
        }

        if ($isNew && empty($deco->image_path) && empty($deco->image_url)) {
            throw new ValidationException(['imageUrl' => 'Provide an image URL or upload a file']);
        }
    }
}
