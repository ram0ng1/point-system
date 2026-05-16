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
use Ramon\PointSystem\Model\NameDecoration;
use Ramon\PointSystem\Model\ShopClaim;
use Ramon\PointSystem\Support\CssSanitizer;

/**
 * @extends AbstractDatabaseResource<NameDecoration>
 */
class NameDecorationResource extends AbstractDatabaseResource
{
    /**
     * Preset slugs that ship with the extension. Their CSS lives in
     * less/common/decorations.less. Admin-created decorations using one of
     * these presets get the preset name as their slug, so the shipped CSS
     * targets them via `.ps-name-{preset}`.
     */
    public const BUILTIN_PRESETS = [
        'gold', 'gold-pulse', 'rainbow', 'neon', 'fire', 'ice', 'glitch',
        'shine', 'galaxy', 'breath', 'royal', 'matrix', 'typer', 'mercury',
        'huecycle', 'blur', 'lightning', 'underline', 'toxic', 'vhs',
        'glass', 'stamp', 'hearts', 'sparkle', 'wave',
    ];

    #[\Override]
    public function type(): string
    {
        return 'point-system-name-decorations';
    }

    #[\Override]
    public function model(): string
    {
        return NameDecoration::class;
    }

    #[\Override]
    public function scope(Builder $query, \Tobyz\JsonApiServer\Context $context): void
    {
        $actor = $context->getActor();

        // Feature gate: when admin turns the family off, non-managers see an
        // empty catalog (their shop tab disappears entirely). Managers still
        // see everything so they can re-enable individual rows from admin.
        if (! $actor->hasPermission('pointSystem.manage')) {
            if (! resolve(FeatureGate::class)->isEnabled(ShopClaim::TYPE_NAME)) {
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
                    resolve(FeatureGate::class)->assertEnabled(ShopClaim::TYPE_NAME);
                    $attrs = (array) ($context->body()['data']['attributes'] ?? []);
                    $deco = new NameDecoration();
                    $this->fill($deco, $attrs, isNew: true);
                    $deco->save();
                    return $deco;
                }),

            Endpoint\Update::make()
                ->authenticated()
                ->can('pointSystem.manage')
                ->action(function (Context $context) {
                    $context->getActor()->assertCan('pointSystem.manage');
                    resolve(FeatureGate::class)->assertEnabled(ShopClaim::TYPE_NAME);
                    /** @var NameDecoration $deco */
                    $deco = NameDecoration::query()->findOrFail($context->modelId);
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
                    resolve(FeatureGate::class)->assertEnabled(ShopClaim::TYPE_NAME);
                    /** @var NameDecoration $deco */
                    $deco = NameDecoration::query()->findOrFail($context->modelId);
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
            Schema\Str::make('preset')->nullable(),
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
        return [
            SortColumn::make('sort'),
            SortColumn::make('price'),
        ];
    }

    protected function fill(NameDecoration $deco, array $attrs, bool $isNew = false): void
    {
        if ($isNew || isset($attrs['name'])) {
            $name = trim((string) ($attrs['name'] ?? $deco->name ?? ''));
            if ($name === '') {
                throw new ValidationException(['name' => 'Required']);
            }
            $deco->name = mb_substr($name, 0, 100);
        }

        if ($isNew && ! $deco->slug) {
            $presetAttr = $attrs['preset'] ?? null;
            if ($presetAttr && in_array($presetAttr, self::BUILTIN_PRESETS, true)) {
                // Built-ins share their slug with the preset name so the shipped
                // CSS targets them. Suffix with -2, -3, ... only if there is
                // already a row with that slug (preserves uniqueness constraint).
                $deco->slug = $this->uniqueSlug($presetAttr);
            } else {
                $deco->slug = $this->uniqueSlug($deco->name);
            }
        }

        if (array_key_exists('description', $attrs)) {
            $deco->description = $attrs['description'] !== null
                ? mb_substr(trim((string) $attrs['description']), 0, 500)
                : null;
        }

        if (array_key_exists('preset', $attrs)) {
            $preset = $attrs['preset'] !== null ? (string) $attrs['preset'] : null;
            $deco->preset = $preset && in_array($preset, self::BUILTIN_PRESETS, true) ? $preset : ($preset ? 'custom' : null);
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
        $base = Str::slug($name) ?: 'deco';
        $base = mb_substr($base, 0, 60);
        $slug = $base;
        $i = 2;
        while (NameDecoration::query()->where('slug', $slug)->exists()) {
            $slug = mb_substr($base, 0, 56).'-'.$i;
            $i++;
        }
        return $slug;
    }
}
