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
use Illuminate\Support\Str;
use Ramon\PointSystem\FeatureGate;
use Ramon\PointSystem\Model\ShopClaim;
use Ramon\PointSystem\Model\TitleDecoration;
use Ramon\PointSystem\Support\CssSanitizer;

/**
 * @extends AbstractDatabaseResource<TitleDecoration>
 */
class TitleDecorationResource extends AbstractDatabaseResource
{
    #[\Override]
    public function type(): string
    {
        return 'point-system-title-decorations';
    }

    #[\Override]
    public function model(): string
    {
        return TitleDecoration::class;
    }

    #[\Override]
    public function scope(Builder $query, \Tobyz\JsonApiServer\Context $context): void
    {
        $actor = $context->getActor();
        if (! $actor->hasPermission('pointSystem.manage')) {
            if (! resolve(FeatureGate::class)->isEnabled(ShopClaim::TYPE_TITLE)) {
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

            Endpoint\Create::make()
                ->authenticated()
                ->can('pointSystem.manage')
                ->action(function (Context $context) {
                    $context->getActor()->assertCan('pointSystem.manage');
                    resolve(FeatureGate::class)->assertEnabled(ShopClaim::TYPE_TITLE);
                    $attrs = (array) ($context->body()['data']['attributes'] ?? []);
                    $deco = new TitleDecoration();
                    $this->fill($deco, $attrs, isNew: true);
                    $deco->save();
                    return $deco;
                }),

            Endpoint\Update::make()
                ->authenticated()
                ->can('pointSystem.manage')
                ->action(function (Context $context) {
                    $context->getActor()->assertCan('pointSystem.manage');
                    resolve(FeatureGate::class)->assertEnabled(ShopClaim::TYPE_TITLE);
                    /** @var TitleDecoration $deco */
                    $deco = TitleDecoration::query()->findOrFail($context->modelId);
                    $attrs = (array) ($context->body()['data']['attributes'] ?? []);
                    $this->fill($deco, $attrs);
                    $deco->save();
                    return $deco;
                }),

            Endpoint\Delete::make()
                ->authenticated()
                ->can('pointSystem.manage')
                ->action(function (Context $context) {
                    $context->getActor()->assertCan('pointSystem.manage');
                    resolve(FeatureGate::class)->assertEnabled(ShopClaim::TYPE_TITLE);
                    /** @var TitleDecoration $deco */
                    $deco = TitleDecoration::query()->findOrFail($context->modelId);
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
            Schema\Str::make('slug'),
            Schema\Str::make('description')->nullable(),
            Schema\Str::make('titleText')->property('title_text'),
            Schema\Str::make('color')->nullable(),
            Schema\Str::make('customCss')->property('custom_css')->nullable(),
            Schema\Integer::make('price'),
            Schema\Boolean::make('isEnabled')->property('is_enabled'),
            Schema\Integer::make('sort'),
            Schema\DateTime::make('createdAt')->property('created_at'),
        ];
    }

    #[\Override]
    public function sorts(): array
    {
        return [SortColumn::make('sort'), SortColumn::make('price')];
    }

    protected function fill(TitleDecoration $deco, array $attrs, bool $isNew = false): void
    {
        if ($isNew || isset($attrs['name'])) {
            $name = trim((string) ($attrs['name'] ?? $deco->name ?? ''));
            if ($name === '') {
                throw new ValidationException(['name' => 'Required']);
            }
            $deco->name = mb_substr($name, 0, 100);
        }

        if ($isNew || array_key_exists('titleText', $attrs)) {
            $text = trim((string) ($attrs['titleText'] ?? $deco->title_text ?? ''));
            if ($text === '') {
                throw new ValidationException(['titleText' => 'Required']);
            }
            // Cap to keep the badge ~one line tall in any UI position.
            $deco->title_text = mb_substr($text, 0, 60);
        }

        if ($isNew && ! $deco->slug) {
            $deco->slug = $this->uniqueSlug($deco->name);
        }

        if (array_key_exists('description', $attrs)) {
            $deco->description = $attrs['description'] !== null
                ? mb_substr(trim((string) $attrs['description']), 0, 500)
                : null;
        }

        if (array_key_exists('color', $attrs)) {
            $color = $attrs['color'] !== null ? trim((string) $attrs['color']) : null;
            // Allow hex, rgb()/rgba(), named tokens — anything <= 24 chars without
            // semicolons or braces. Rendered via CSS custom property so this is
            // safe enough; CSS sanitizer below catches the rest.
            if ($color !== null && (str_contains($color, ';') || str_contains($color, '{') || str_contains($color, '}'))) {
                throw new ValidationException(['color' => 'Invalid color value']);
            }
            $deco->color = $color === null || $color === '' ? null : mb_substr($color, 0, 24);
        }

        if (array_key_exists('customCss', $attrs)) {
            $deco->custom_css = $attrs['customCss'] !== null
                ? CssSanitizer::sanitize((string) $attrs['customCss'])
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

    protected function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'title';
        $base = mb_substr($base, 0, 60);
        $slug = $base;
        $i = 2;
        while (TitleDecoration::query()->where('slug', $slug)->exists()) {
            $slug = mb_substr($base, 0, 56).'-'.$i;
            $i++;
        }
        return $slug;
    }
}
