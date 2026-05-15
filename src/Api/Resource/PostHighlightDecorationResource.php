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
use Ramon\PointSystem\Model\PostHighlightDecoration;
use Ramon\PointSystem\Model\ShopClaim;

/**
 * @extends AbstractDatabaseResource<PostHighlightDecoration>
 */
class PostHighlightDecorationResource extends AbstractDatabaseResource
{
    /**
     * Built-in highlight presets. Their CSS ships in
     * less/common/decorations.less under `.ps-posthl-{preset}`.
     */
    public const BUILTIN_PRESETS = [
        'gold-border', 'silver-border', 'glow-blue', 'glow-purple',
        'glow-green', 'ribbon-red', 'ribbon-gold', 'dashed-accent',
        'gradient-edge', 'shadow-soft',
    ];

    #[\Override]
    public function type(): string
    {
        return 'point-system-post-highlight-decorations';
    }

    #[\Override]
    public function model(): string
    {
        return PostHighlightDecoration::class;
    }

    #[\Override]
    public function scope(Builder $query, \Tobyz\JsonApiServer\Context $context): void
    {
        $actor = $context->getActor();
        if (! $actor->hasPermission('pointSystem.manage')) {
            if (! resolve(FeatureGate::class)->isEnabled(ShopClaim::TYPE_POST_HL)) {
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
                    resolve(FeatureGate::class)->assertEnabled(ShopClaim::TYPE_POST_HL);
                    $attrs = (array) ($context->body()['data']['attributes'] ?? []);
                    $deco = new PostHighlightDecoration();
                    $this->fill($deco, $attrs, isNew: true);
                    $deco->save();
                    return $deco;
                }),

            Endpoint\Update::make()
                ->authenticated()
                ->can('pointSystem.manage')
                ->action(function (Context $context) {
                    $context->getActor()->assertCan('pointSystem.manage');
                    resolve(FeatureGate::class)->assertEnabled(ShopClaim::TYPE_POST_HL);
                    /** @var PostHighlightDecoration $deco */
                    $deco = PostHighlightDecoration::query()->findOrFail($context->modelId);
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
                    resolve(FeatureGate::class)->assertEnabled(ShopClaim::TYPE_POST_HL);
                    /** @var PostHighlightDecoration $deco */
                    $deco = PostHighlightDecoration::query()->findOrFail($context->modelId);
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
        return [SortColumn::make('sort'), SortColumn::make('price')];
    }

    protected function fill(PostHighlightDecoration $deco, array $attrs, bool $isNew = false): void
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
                ? $this->sanitizeCss((string) $attrs['customCss'])
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

    /**
     * Same sanitization profile as NameDecorationResource::sanitizeCss.
     * See that method for the rationale on each pass.
     */
    protected function sanitizeCss(string $css): string
    {
        $css = mb_substr($css, 0, 4000);
        $css = preg_replace_callback(
            '/\\\\([0-9a-fA-F]{1,6})\s?/',
            fn ($m) => chr(hexdec($m[1]) & 0x7f),
            $css,
        );
        $css = preg_replace('#</\s*style#i', '', $css);
        $css = preg_replace('#<\s*script#i', '', $css);
        $css = preg_replace('#expression\s*\(#i', '', $css);
        $css = preg_replace('#behavior\s*:#i', '', $css);
        $css = preg_replace('#-moz-binding\s*:#i', '', $css);
        $css = preg_replace('#url\s*\(\s*[\'"]?\s*javascript:#i', 'url(', $css);
        $css = preg_replace('#url\s*\(\s*[\'"]?\s*data:#i', 'url(', $css);
        $css = preg_replace('#position\s*:\s*fixed#i', 'position:static', $css);
        $css = preg_replace('#position\s*:\s*sticky#i', 'position:static', $css);
        $css = preg_replace('#display\s*:\s*none#i', '', $css);
        $css = preg_replace_callback(
            '/@-?(?:webkit-|moz-|ms-|o-)?([a-zA-Z][a-zA-Z0-9_-]*)/i',
            function ($m) {
                $name = strtolower($m[1]);
                return $name === 'keyframes' ? $m[0] : '';
            },
            $css,
        );
        return (string) $css;
    }

    protected function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'posthl';
        $base = mb_substr($base, 0, 60);
        $slug = $base;
        $i = 2;
        while (PostHighlightDecoration::query()->where('slug', $slug)->exists()) {
            $slug = mb_substr($base, 0, 56).'-'.$i;
            $i++;
        }
        return $slug;
    }
}
