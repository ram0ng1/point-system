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
use Ramon\PointSystem\Model\CoverDecoration;
use Ramon\PointSystem\Model\ShopClaim;
use Ramon\PointSystem\Support\ItemAvailability;
use Ramon\PointSystem\Support\RemoteImageUrl;
use Ramon\PointSystem\Support\SubmissionScope;

/**
 * @extends AbstractDatabaseResource<CoverDecoration>
 */
class CoverDecorationResource extends AbstractDatabaseResource
{
    #[\Override]
    public function type(): string
    {
        return 'point-system-cover-decorations';
    }

    #[\Override]
    public function model(): string
    {
        return CoverDecoration::class;
    }

    #[\Override]
    public function scope(Builder $query, \Tobyz\JsonApiServer\Context $context): void
    {
        $actor = $context->getActor();
        if (! $actor->hasPermission('pointSystem.manage')) {
            if (! resolve(FeatureGate::class)->isEnabled(ShopClaim::TYPE_COVER)) {
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
            Endpoint\Index::make()->paginate(100, 200),
            Endpoint\Show::make(),

            Endpoint\Create::make()
                ->authenticated()
                ->action(function (Context $context) {
                    $actor     = $context->getActor();
                    $features  = resolve(FeatureGate::class);
                    $isManager = $actor->hasPermission('pointSystem.manage');

                    $features->assertEnabled(ShopClaim::TYPE_COVER);
                    if (! $isManager) {
                        $features->assertUserSubmissionsEnabled();
                    }

                    $attrs = (array) ($context->body()['data']['attributes'] ?? []);
                    $deco = new CoverDecoration();
                    $this->fill($deco, $attrs, isNew: true, byManager: $isManager);

                    if (! $isManager) {
                        if (empty($deco->image_url)) {
                            throw new ValidationException(['imageUrl' => 'User submissions must include an image URL']);
                        }
                        $deco->image_path = null;
                        $deco->creator_id = (int) $actor->id;
                        $deco->status = CoverDecoration::STATUS_PENDING;
                        $deco->is_enabled = false;
                        $deco->price = 0;
                    }

                    $deco->save();
                    return $deco;
                }),

            Endpoint\Update::make()
                ->can('manage')
                ->action(function (Context $context) {
                    resolve(FeatureGate::class)->assertEnabled(ShopClaim::TYPE_COVER);
                    /** @var CoverDecoration $deco */
                    $deco = CoverDecoration::query()->findOrFail($context->modelId);
                    $attrs = (array) ($context->body()['data']['attributes'] ?? []);
                    $this->fill($deco, $attrs, byManager: true);
                    $deco->save();
                    return $deco;
                }),

            Endpoint\Delete::make()
                ->can('manage')
                ->action(function (Context $context) {
                    resolve(FeatureGate::class)->assertEnabled(ShopClaim::TYPE_COVER);
                    /** @var CoverDecoration $deco */
                    $deco = CoverDecoration::query()->findOrFail($context->modelId);
                    $deco->delete();
                    return null;
                }),
        ];
    }

    #[\Override]
    public function fields(): array
    {
        return array_merge([
            Schema\Str::make('name'),
            Schema\Str::make('description')->nullable(),
            Schema\Str::make('imagePath')->property('image_path')->nullable(),
            Schema\Str::make('imageUrl')->property('image_url')->nullable(),
            Schema\Boolean::make('isAnimated')->property('is_animated'),
            Schema\Integer::make('price'),
            Schema\Boolean::make('isEnabled')->property('is_enabled'),
            Schema\Integer::make('sort'),
            Schema\DateTime::make('createdAt')->property('created_at'),
            Schema\Str::make('status'),
            Schema\Integer::make('creatorId')->property('creator_id')->nullable(),
            Schema\Str::make('creatorUsername')->get(fn (CoverDecoration $d) => optional($d->creator)->username),
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

    protected function fill(CoverDecoration $deco, array $attrs, bool $isNew = false, bool $byManager = true): void
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
                CoverDecoration::STATUS_APPROVED,
                CoverDecoration::STATUS_PENDING,
                CoverDecoration::STATUS_REJECTED,
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
