<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Api;

use Flarum\Api\Context;
use Flarum\Api\Schema;
use Flarum\Settings\SettingsRepositoryInterface;
use Ramon\PointSystem\Model\AutoGroupTier;
use Ramon\PointSystem\Model\AvatarDecoration;
use Ramon\PointSystem\Model\NameDecoration;

/**
 * Adds the full catalog of enabled decorations to the forum payload so they can
 * be rendered on any page (post stream, user card, etc.) without an extra
 * round-trip. The catalog is small (admin-curated) so eagerly loading it is
 * cheaper than lazy fetches on every page.
 */
class ForumAttributes
{
    public function __invoke(): array
    {
        return [
            Schema\Arr::make('pointSystemAvatarDecorations')
                ->get(function () {
                    return AvatarDecoration::where('is_enabled', true)
                        ->orderBy('sort')
                        ->orderBy('id')
                        ->get()
                        ->map(fn (AvatarDecoration $d) => [
                            'id' => $d->id,
                            'name' => $d->name,
                            'description' => $d->description,
                            'imagePath' => $d->image_path,
                            'isAnimated' => (bool) $d->is_animated,
                            'price' => (int) $d->price,
                        ])
                        ->toArray();
                }),

            Schema\Arr::make('pointSystemNameDecorations')
                ->get(function () {
                    return NameDecoration::where('is_enabled', true)
                        ->orderBy('sort')
                        ->orderBy('id')
                        ->get()
                        ->map(fn (NameDecoration $d) => [
                            'id' => $d->id,
                            'name' => $d->name,
                            'slug' => $d->slug,
                            'description' => $d->description,
                            'preset' => $d->preset,
                            'customCss' => $d->custom_css,
                            'price' => (int) $d->price,
                        ])
                        ->toArray();
                }),

            // Auto-group tiers shown on the Rewards page so users know what
            // they unlock at each lifetime threshold. Returns empty when the
            // feature is disabled — frontend then hides the whole tab/section.
            Schema\Arr::make('pointSystemAutoGroupTiers')
                ->get(function () {
                    $settings = resolve(SettingsRepositoryInterface::class);
                    if (! (bool) $settings->get('point-system.auto_group_enabled', true)) {
                        return [];
                    }
                    return AutoGroupTier::with('group')
                        ->where('is_enabled', true)
                        ->orderBy('points_required')
                        ->get()
                        ->map(fn (AutoGroupTier $t) => [
                            'id' => $t->id,
                            'groupId' => $t->group_id,
                            'groupName' => optional($t->group)->name_plural ?: optional($t->group)->name_singular,
                            'groupColor' => optional($t->group)->color,
                            'groupIcon' => optional($t->group)->icon,
                            'pointsRequired' => (int) $t->points_required,
                        ])
                        ->toArray();
                }),

            // Per-user permissions exposed to the frontend so we can gate the
            // nav entry, the Rewards page itself, and the claim button.
            Schema\Boolean::make('pointSystemCanViewShop')
                ->get(fn ($_, Context $context) => $context->getActor()->hasPermission('pointSystem.viewShop')),

            Schema\Boolean::make('pointSystemCanClaim')
                ->get(fn ($_, Context $context) => $context->getActor()->hasPermission('pointSystem.claim')),

            Schema\Boolean::make('pointSystemCanManage')
                ->get(fn ($_, Context $context) => $context->getActor()->hasPermission('pointSystem.manage')),
        ];
    }
}
