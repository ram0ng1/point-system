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
        }
    }

    #[\Override]
    public function endpoints(): array
    {
        return [
            Endpoint\Index::make()->paginate(100, 200),
            Endpoint\Show::make(),

            Endpoint\Update::make()
                ->can('manage')
                ->action(function (Context $context) {
                    /** @var CoverDecoration $deco */
                    $deco = CoverDecoration::query()->findOrFail($context->modelId);
                    $attrs = (array) ($context->body()['data']['attributes'] ?? []);
                    $this->fill($deco, $attrs);
                    $deco->save();
                    return $deco;
                }),

            Endpoint\Delete::make()
                ->can('manage')
                ->action(function (Context $context) {
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
        return [
            Schema\Str::make('name'),
            Schema\Str::make('description')->nullable(),
            Schema\Str::make('imagePath')->property('image_path'),
            Schema\Boolean::make('isAnimated')->property('is_animated'),
            Schema\Integer::make('price'),
            Schema\Boolean::make('isEnabled')->property('is_enabled'),
            Schema\Integer::make('sort'),
            Schema\DateTime::make('createdAt')->property('created_at'),
        ];
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

    protected function fill(CoverDecoration $deco, array $attrs): void
    {
        if (isset($attrs['name'])) {
            $name = trim((string) $attrs['name']);
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
        if (isset($attrs['price'])) {
            $deco->price = max(0, (int) $attrs['price']);
        }
        if (isset($attrs['isEnabled'])) {
            $deco->is_enabled = (bool) $attrs['isEnabled'];
        }
        if (isset($attrs['sort'])) {
            $deco->sort = (int) $attrs['sort'];
        }
    }
}
