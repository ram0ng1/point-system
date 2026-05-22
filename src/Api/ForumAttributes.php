<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Api;

use Flarum\Api\Context;
use Flarum\Api\Schema;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Database\Eloquent\Builder;
use Ramon\PointSystem\FeatureGate;
use Ramon\PointSystem\Model\AvatarDecoration;
use Ramon\PointSystem\Model\CoverDecoration;
use Ramon\PointSystem\Model\GroupOffer;
use Ramon\PointSystem\Model\NameDecoration;
use Ramon\PointSystem\Model\PostHighlightDecoration;
use Ramon\PointSystem\Model\ShopClaim;
use Ramon\PointSystem\Model\TitleDecoration;
use Ramon\PointSystem\Support\CssSanitizer;
use Ramon\PointSystem\Support\ItemAvailability;
use Ramon\PointSystem\Support\SubmissionScope;

/**
 * Adds the full catalog of enabled decorations to the forum payload so they can
 * be rendered on any page (post stream, user card, etc.) without an extra
 * round-trip. The catalog is small (admin-curated) so eagerly loading it is
 * cheaper than lazy fetches on every page.
 *
 * Decoration catalogs use {@see ItemAvailability::applyShopOrOwnedScope}: the
 * public shop sees only enabled / listed / in-window / unrestricted items, but
 * a user that already OWNS an item keeps seeing it even after the admin
 * disables, unlists, or lets it expire. Each item also ships an `isAvailable`
 * boolean so the shop UI can filter the "buyable" grid down to active items
 * while the "My decorations" page still shows everything owned.
 *
 * Group offers don't have a ShopClaim equivalent (membership lives in the
 * group_user pivot) so they keep the original is_enabled + shop-scope path.
 *
 * Note on customCss fields: although these strings are sanitized on WRITE
 * inside each decoration resource, we re-run {@see CssSanitizer::sanitize}
 * on EMIT here as defense-in-depth (CLAUDE.md §21). Rationale: admin-account
 * compromise is part of the threat model, and rows that pre-date the write
 * sanitizer (or that come from a direct DB edit) are normalized to the same
 * allowlist before being serialized into the forum payload.
 */
class ForumAttributes
{
    public function __construct(
        protected SettingsRepositoryInterface $settings,
        protected FeatureGate $features,
    ) {}

    /** @var array<string, bool> per-request memoization of creator_id column presence */
    private array $hasCreatorColumnCache = [];

    public function __invoke(): array
    {
        // The submission columns (`status`, `creator_id`) ship with the
        // 2026_05_16_000004 migration. If an admin upgrades the code BEFORE
        // running `php flarum migrate`, accessing those properties on a
        // pre-migration model still works (Eloquent treats them as null),
        // but the SubmissionScope SQL filter and the `with('creator')` load
        // would crash. SubmissionScope already detects this and self-skips;
        // we mirror that check here so the serializer doesn't ship bogus
        // creator data when the columns aren't there yet.
        $serializeAvailability = static function ($d, $actor): array {
            $hasCreator = isset($d->attributes['creator_id']) || array_key_exists('creator_id', $d->getAttributes());
            $creator = $hasCreator && $d->creator_id ? $d->creator : null;
            return [
                'isEnabled'        => (bool) ($d->is_enabled ?? true),
                'isAvailable'      => ItemAvailability::reasonNotClaimable($d, $actor) === null,
                'maxClaims'        => $d->max_claims !== null ? (int) $d->max_claims : null,
                'claimCount'       => (int) ($d->claim_count ?? 0),
                'availableFrom'    => optional($d->available_from)?->toIso8601String(),
                'availableUntil'   => optional($d->available_until)?->toIso8601String(),
                'isListed'         => (bool) ($d->is_listed ?? true),
                'allowedGroupIds'  => ItemAvailability::allowedGroupIds($d) ?? [],
                'status'           => (string) ($d->status ?? 'approved'),
                'creatorId'        => $hasCreator && $d->creator_id !== null ? (int) $d->creator_id : null,
                'creatorUsername'  => $creator ? (string) $creator->username : null,
                'creatorDisplayName' => $creator ? (string) ($creator->display_name ?? $creator->username) : null,
                'creatorAvatarUrl' => $creator && $creator->avatar_url ? (string) $creator->avatar_url : null,
            ];
        };

        $scopeFor = function (Builder $q, Context $context, string $itemType): Builder {
            $actor = $context->getActor();
            // Skip creator eager-load if the column doesn't exist yet
            // (admin upgraded code before running migrate). Cache the
            // INFORMATION_SCHEMA result per-request — without it every
            // forum page-load fires 5 schema lookups.
            $model = $q->getModel();
            $table = $model->getTable();
            if (! array_key_exists($table, $this->hasCreatorColumnCache)) {
                try {
                    $this->hasCreatorColumnCache[$table] = $model->getConnection()
                        ->getSchemaBuilder()
                        ->hasColumn($table, 'creator_id');
                } catch (\Throwable) {
                    $this->hasCreatorColumnCache[$table] = false;
                }
            }
            if ($this->hasCreatorColumnCache[$table]) {
                $q->with('creator');
            }
            ItemAvailability::applyShopOrOwnedScope($q, $actor, $itemType);
            SubmissionScope::apply($q, $actor);
            return $q;
        };

        // Group offers keep the older shop-scope path: there's no per-user
        // "ownership" of an offer (the user is in the group or not), so
        // disabling an offer should be safe to do — current members keep
        // their group membership independently of the offer row's state.
        $scopeForOffers = function (Builder $q, Context $context): Builder {
            $q->where('is_enabled', true);
            ItemAvailability::applyShopScope($q, $context->getActor());
            return $q;
        };

        return [
            Schema\Arr::make('pointSystemAvatarDecorations')
                ->get(function ($_, Context $context) use ($serializeAvailability, $scopeFor) {
                    if (! $this->features->isEnabled(ShopClaim::TYPE_AVATAR)) {
                        return [];
                    }
                    $actor = $context->getActor();
                    return $scopeFor(AvatarDecoration::query(), $context, ShopClaim::TYPE_AVATAR)
                        ->orderBy('sort')
                        ->orderBy('id')
                        ->get()
                        ->map(fn (AvatarDecoration $d) => array_merge([
                            'id' => $d->id,
                            'name' => $d->name,
                            'description' => $d->description,
                            'imagePath' => $d->image_path,
                            'imageUrl' => $d->image_url,
                            'isAnimated' => (bool) $d->is_animated,
                            'price' => (int) $d->price,
                        ], $serializeAvailability($d, $actor)))
                        ->toArray();
                }),

            Schema\Arr::make('pointSystemNameDecorations')
                ->get(function ($_, Context $context) use ($serializeAvailability, $scopeFor) {
                    if (! $this->features->isEnabled(ShopClaim::TYPE_NAME)) {
                        return [];
                    }
                    $actor = $context->getActor();
                    return $scopeFor(NameDecoration::query(), $context, ShopClaim::TYPE_NAME)
                        ->orderBy('sort')
                        ->orderBy('id')
                        ->get()
                        ->map(fn (NameDecoration $d) => array_merge([
                            'id' => $d->id,
                            'name' => $d->name,
                            'slug' => $d->slug,
                            'description' => $d->description,
                            'preset' => $d->preset,
                            'customCss' => CssSanitizer::sanitize($d->custom_css),
                            'price' => (int) $d->price,
                        ], $serializeAvailability($d, $actor)))
                        ->toArray();
                }),

            Schema\Arr::make('pointSystemCoverDecorations')
                ->get(function ($_, Context $context) use ($serializeAvailability, $scopeFor) {
                    if (! $this->features->isEnabled(ShopClaim::TYPE_COVER)) {
                        return [];
                    }
                    $actor = $context->getActor();
                    return $scopeFor(CoverDecoration::query(), $context, ShopClaim::TYPE_COVER)
                        ->orderBy('sort')
                        ->orderBy('id')
                        ->get()
                        ->map(fn (CoverDecoration $d) => array_merge([
                            'id' => $d->id,
                            'name' => $d->name,
                            'description' => $d->description,
                            'imagePath' => $d->image_path,
                            'imageUrl' => $d->image_url,
                            'isAnimated' => (bool) $d->is_animated,
                            'price' => (int) $d->price,
                        ], $serializeAvailability($d, $actor)))
                        ->toArray();
                }),

            Schema\Arr::make('pointSystemTitleDecorations')
                ->get(function ($_, Context $context) use ($serializeAvailability, $scopeFor) {
                    if (! $this->features->isEnabled(ShopClaim::TYPE_TITLE)) {
                        return [];
                    }
                    $actor = $context->getActor();
                    return $scopeFor(TitleDecoration::query(), $context, ShopClaim::TYPE_TITLE)
                        ->orderBy('sort')
                        ->orderBy('id')
                        ->get()
                        ->map(fn (TitleDecoration $d) => array_merge([
                            'id' => $d->id,
                            'name' => $d->name,
                            'slug' => $d->slug,
                            'description' => $d->description,
                            'titleText' => $d->title_text,
                            'color' => $d->color,
                            'customCss' => CssSanitizer::sanitize($d->custom_css),
                            'price' => (int) $d->price,
                        ], $serializeAvailability($d, $actor)))
                        ->toArray();
                }),

            Schema\Arr::make('pointSystemPostHighlightDecorations')
                ->get(function ($_, Context $context) use ($serializeAvailability, $scopeFor) {
                    if (! $this->features->isEnabled(ShopClaim::TYPE_POST_HL)) {
                        return [];
                    }
                    $actor = $context->getActor();
                    return $scopeFor(PostHighlightDecoration::query(), $context, ShopClaim::TYPE_POST_HL)
                        ->orderBy('sort')
                        ->orderBy('id')
                        ->get()
                        ->map(fn (PostHighlightDecoration $d) => array_merge([
                            'id' => $d->id,
                            'name' => $d->name,
                            'slug' => $d->slug,
                            'description' => $d->description,
                            'preset' => $d->preset,
                            'customCss' => CssSanitizer::sanitize($d->custom_css),
                            'price' => (int) $d->price,
                        ], $serializeAvailability($d, $actor)))
                        ->toArray();
                }),

            // Group offers shown on the Rewards page. Each offer can be
            // unlocked via auto-attach (lifetime threshold), explicit purchase
            // (balance deduction), or both — the UI uses the flags to render
            // the right CTA per card. Returns empty when the feature is off.
            Schema\Arr::make('pointSystemGroupOffers')
                ->get(function ($_, Context $context) use ($serializeAvailability, $scopeForOffers) {
                    if (! (bool) $this->settings->get('point-system.auto_group_enabled', true)) {
                        return [];
                    }
                    $actor = $context->getActor();
                    return $scopeForOffers(GroupOffer::query()->with('group'), $context)
                        ->orderBy('points_required')
                        ->get()
                        ->map(fn (GroupOffer $o) => array_merge([
                            'id' => $o->id,
                            'groupId' => $o->group_id,
                            'groupName' => optional($o->group)->name_plural ?: optional($o->group)->name_singular,
                            'groupColor' => optional($o->group)->color,
                            'groupIcon' => optional($o->group)->icon,
                            'pointsRequired' => (int) $o->points_required,
                            'price' => (int) $o->price,
                            'isAuto' => (bool) $o->is_auto,
                            'isPurchasable' => (bool) $o->is_purchasable,
                        ], $serializeAvailability($o, $actor)))
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

            // Trade subsystem — exposes both the master toggle (so the UI
            // can hide the "Trade" button forum-wide) and the per-actor
            // permission (so the UI hides the button for users in groups
            // the admin hasn't authorized). The frontend must check BOTH:
            //   pointSystemTradeEnabled && pointSystemCanTrade
            Schema\Boolean::make('pointSystemTradeEnabled')
                ->get(fn () => $this->features->isTradeEnabled()),

            Schema\Boolean::make('pointSystemCanTrade')
                ->get(fn ($_, Context $context) =>
                    $this->features->isTradeEnabled()
                    && $context->getActor()->hasPermission('pointSystem.trade')
                ),

            // User-submission feature: master toggle exposure. The "Submit
            // decoration" CTA on the forum reads this; the JSON:API Create
            // endpoint enforces it server-side too. Authenticated-only —
            // guests never see the submit option.
            Schema\Boolean::make('pointSystemUserSubmissionsEnabled')
                ->get(fn () => $this->features->isUserSubmissionsEnabled()),
        ];
    }
}
