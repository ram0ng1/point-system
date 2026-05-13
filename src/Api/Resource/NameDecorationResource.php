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
use Ramon\PointSystem\Model\NameDecoration;

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

    public function type(): string
    {
        return 'point-system-name-decorations';
    }

    public function model(): string
    {
        return NameDecoration::class;
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

            Endpoint\Create::make()
                ->authenticated()
                ->action(function (Context $context) {
                    $context->getActor()->assertCan('pointSystem.manage');
                    $attrs = (array) ($context->body()['data']['attributes'] ?? []);
                    $deco = new NameDecoration();
                    $this->fill($deco, $attrs, isNew: true);
                    $deco->save();
                    return $deco;
                }),

            Endpoint\Update::make()
                ->action(function (Context $context) {
                    $context->getActor()->assertCan('pointSystem.manage');
                    /** @var NameDecoration $deco */
                    $deco = NameDecoration::query()->findOrFail($context->modelId);
                    $attrs = (array) ($context->body()['data']['attributes'] ?? []);
                    $this->fill($deco, $attrs);
                    $deco->save();
                    return $deco;
                }),

            Endpoint\Delete::make()
                ->action(function (Context $context) {
                    $context->getActor()->assertCan('pointSystem.manage');
                    /** @var NameDecoration $deco */
                    $deco = NameDecoration::query()->findOrFail($context->modelId);
                    $deco->delete();
                    return null;
                }),
        ];
    }

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
     * Strip anything that could escape the CSS context or weaponize the
     * stylesheet for social-engineering (full-page overlays, hiding chrome).
     * This content is injected into a <style> block on every page — a single
     * `</style><script>...` bypass would be RCE-grade.
     *
     * Strategy:
     *   1. Cap length.
     *   2. Normalize CSS hex escapes (`\69mport` → `import`) so the rest of
     *      the regex blocklist can't be bypassed by escape encoding.
     *   3. Strip the obvious markup-break and script-eval primitives.
     *   4. Block `position: fixed/sticky` and `display: none` on broad
     *      selectors — those are the building blocks of overlay phishing.
     *   5. Drop @-rules other than the explicitly-allowed `@keyframes` /
     *      `@-webkit-keyframes`. Kills `@import`, `@charset`, `@namespace`,
     *      `@font-face` (which can leak via download URL), etc.
     */
    protected function sanitizeCss(string $css): string
    {
        $css = mb_substr($css, 0, 4000);

        // Decode CSS hex escapes (`\69`, `\0069`, etc.) so the blocklist below
        // sees the literal characters and can't be bypassed by encoding.
        $css = preg_replace_callback(
            '/\\\\([0-9a-fA-F]{1,6})\s?/',
            fn ($m) => chr(hexdec($m[1]) & 0x7f),
            $css,
        );

        // Markup escape + JS-eval primitives.
        $css = preg_replace('#</\s*style#i', '', $css);
        $css = preg_replace('#<\s*script#i', '', $css);
        $css = preg_replace('#expression\s*\(#i', '', $css);
        $css = preg_replace('#behavior\s*:#i', '', $css);
        $css = preg_replace('#-moz-binding\s*:#i', '', $css);
        $css = preg_replace('#url\s*\(\s*[\'"]?\s*javascript:#i', 'url(', $css);
        $css = preg_replace('#url\s*\(\s*[\'"]?\s*data:#i', 'url(', $css);

        // Block overlay primitives (full-page positioning + display:none).
        // These can hide the forum UI behind a fake login form, etc.
        $css = preg_replace('#position\s*:\s*fixed#i', 'position:static', $css);
        $css = preg_replace('#position\s*:\s*sticky#i', 'position:static', $css);
        $css = preg_replace('#display\s*:\s*none#i', '', $css);

        // Drop any @-rule that isn't @keyframes / @-webkit-keyframes.
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
