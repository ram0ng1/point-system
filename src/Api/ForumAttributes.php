<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Api;

use Flarum\Api\Context;
use Flarum\Api\Schema;
use Flarum\Settings\SettingsRepositoryInterface;
use Ramon\PointSystem\FeatureGate;
use Ramon\PointSystem\Model\AvatarDecoration;
use Ramon\PointSystem\Model\GroupOffer;
use Ramon\PointSystem\Model\CoverDecoration;
use Ramon\PointSystem\Model\NameDecoration;
use Ramon\PointSystem\Model\PostHighlightDecoration;
use Ramon\PointSystem\Model\ShopClaim;
use Ramon\PointSystem\Model\TitleDecoration;

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
                    if (! resolve(FeatureGate::class)->isEnabled(ShopClaim::TYPE_AVATAR)) {
                        return [];
                    }
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
                    if (! resolve(FeatureGate::class)->isEnabled(ShopClaim::TYPE_NAME)) {
                        return [];
                    }
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

            Schema\Arr::make('pointSystemCoverDecorations')
                ->get(function () {
                    if (! resolve(FeatureGate::class)->isEnabled(ShopClaim::TYPE_COVER)) {
                        return [];
                    }
                    return CoverDecoration::where('is_enabled', true)
                        ->orderBy('sort')
                        ->orderBy('id')
                        ->get()
                        ->map(fn (CoverDecoration $d) => [
                            'id' => $d->id,
                            'name' => $d->name,
                            'description' => $d->description,
                            'imagePath' => $d->image_path,
                            'isAnimated' => (bool) $d->is_animated,
                            'price' => (int) $d->price,
                        ])
                        ->toArray();
                }),

            Schema\Arr::make('pointSystemTitleDecorations')
                ->get(function () {
                    if (! resolve(FeatureGate::class)->isEnabled(ShopClaim::TYPE_TITLE)) {
                        return [];
                    }
                    return TitleDecoration::where('is_enabled', true)
                        ->orderBy('sort')
                        ->orderBy('id')
                        ->get()
                        ->map(fn (TitleDecoration $d) => [
                            'id' => $d->id,
                            'name' => $d->name,
                            'slug' => $d->slug,
                            'description' => $d->description,
                            'titleText' => $d->title_text,
                            'color' => $d->color,
                            'customCss' => $d->custom_css,
                            'price' => (int) $d->price,
                        ])
                        ->toArray();
                }),

            Schema\Arr::make('pointSystemPostHighlightDecorations')
                ->get(function () {
                    if (! resolve(FeatureGate::class)->isEnabled(ShopClaim::TYPE_POST_HL)) {
                        return [];
                    }
                    return PostHighlightDecoration::where('is_enabled', true)
                        ->orderBy('sort')
                        ->orderBy('id')
                        ->get()
                        ->map(fn (PostHighlightDecoration $d) => [
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

            // Group offers shown on the Rewards page. Each offer can be
            // unlocked via auto-attach (lifetime threshold), explicit purchase
            // (balance deduction), or both — the UI uses the flags to render
            // the right CTA per card. Returns empty when the feature is off.
            Schema\Arr::make('pointSystemGroupOffers')
                ->get(function () {
                    $settings = resolve(SettingsRepositoryInterface::class);
                    if (! (bool) $settings->get('point-system.auto_group_enabled', true)) {
                        return [];
                    }
                    return GroupOffer::with('group')
                        ->where('is_enabled', true)
                        ->orderBy('points_required')
                        ->get()
                        ->map(fn (GroupOffer $o) => [
                            'id' => $o->id,
                            'groupId' => $o->group_id,
                            'groupName' => optional($o->group)->name_plural ?: optional($o->group)->name_singular,
                            'groupColor' => optional($o->group)->color,
                            'groupIcon' => optional($o->group)->icon,
                            'pointsRequired' => (int) $o->points_required,
                            'price' => (int) $o->price,
                            'isAuto' => (bool) $o->is_auto,
                            'isPurchasable' => (bool) $o->is_purchasable,
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
