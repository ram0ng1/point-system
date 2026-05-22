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
use Ramon\PointSystem\Support\ItemAvailability;
use Ramon\PointSystem\Support\SubmissionScope;

/**
 * @extends AbstractDatabaseResource<TitleDecoration>
 */
class TitleDecorationResource extends AbstractDatabaseResource
{
    /**
     * Core builds the real resource through the container (constructor runs)
     * and a separate shell via newInstanceWithoutConstructor() only to read
     * route metadata. Injected dependencies are safe everywhere except the
     * bare body of endpoints()/fields(); every use here is inside a request-
     * time callback or scope(), which run only on the constructed instance.
     */
    public function __construct(
        protected FeatureGate $features,
    ) {}

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
            if (! $this->features->isEnabled(ShopClaim::TYPE_TITLE)) {
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
                    $features  = $this->features;
                    $isManager = $actor->hasPermission('pointSystem.manage');

                    $features->assertEnabled(ShopClaim::TYPE_TITLE);
                    if (! $isManager) {
                        $features->assertUserSubmissionsEnabled();
                    }

                    $attrs = (array) ($context->body()['data']['attributes'] ?? []);
                    $deco = new TitleDecoration();
                    $this->fill($deco, $attrs, isNew: true, byManager: $isManager);

                    if (! $isManager) {
                        $deco->creator_id = (int) $actor->id;
                        $deco->status = TitleDecoration::STATUS_PENDING;
                        $deco->is_enabled = false;
                        $deco->price = 0;
                    }

                    $deco->save();
                    return $deco;
                }),

            Endpoint\Update::make()
                ->authenticated()
                ->can('pointSystem.manage')
                ->action(function (Context $context) {
                    $context->getActor()->assertCan('pointSystem.manage');
                    $this->features->assertEnabled(ShopClaim::TYPE_TITLE);
                    /** @var TitleDecoration $deco */
                    $deco = TitleDecoration::query()->findOrFail($context->modelId);
                    $attrs = (array) ($context->body()['data']['attributes'] ?? []);
                    $this->fill($deco, $attrs, byManager: true);
                    $deco->save();
                    return $deco;
                }),

            Endpoint\Delete::make()
                ->authenticated()
                ->can('pointSystem.manage')
                ->action(function (Context $context) {
                    $context->getActor()->assertCan('pointSystem.manage');
                    $this->features->assertEnabled(ShopClaim::TYPE_TITLE);
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
        $managerOnly = fn (TitleDecoration $d, \Flarum\Api\Context $context) =>
            $context->getActor()->hasPermission('pointSystem.manage');
        $managerOrCreator = fn (TitleDecoration $d, \Flarum\Api\Context $context) =>
            $context->getActor()->hasPermission('pointSystem.manage')
            || (int) $context->getActor()->id === (int) $d->creator_id;

        return array_merge([
            Schema\Str::make('name')->writable(),
            Schema\Str::make('slug'),
            Schema\Str::make('description')->nullable()->writable(),
            Schema\Str::make('titleText')->property('title_text')->writable(),
            Schema\Str::make('color')->nullable()->writable(),
            Schema\Str::make('customCss')->property('custom_css')->nullable()->writable(),
            Schema\Integer::make('price')->writable($managerOnly),
            Schema\Boolean::make('isEnabled')->property('is_enabled')->writable($managerOnly),
            Schema\Integer::make('sort')->writable($managerOnly),
            Schema\DateTime::make('createdAt')->property('created_at'),
            Schema\Str::make('status')->writable($managerOnly),
            Schema\Integer::make('creatorId')->property('creator_id')->nullable()
                ->visible($managerOrCreator),
            Schema\Str::make('creatorUsername')
                ->visible($managerOrCreator)
                ->get(fn (TitleDecoration $d) => optional($d->creator)->username),
        ], AvailabilityFields::fields());
    }

    #[\Override]
    public function sorts(): array
    {
        return [SortColumn::make('sort'), SortColumn::make('price')];
    }

    protected function fill(TitleDecoration $deco, array $attrs, bool $isNew = false, bool $byManager = true): void
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

        if ($byManager) {
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
                TitleDecoration::STATUS_APPROVED,
                TitleDecoration::STATUS_PENDING,
                TitleDecoration::STATUS_REJECTED,
            ], true)) {
                $deco->status = (string) $attrs['status'];
            }
            ItemAvailability::fillFromAttrs($deco, $attrs);
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
