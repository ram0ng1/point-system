<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Api;

use Flarum\Api\Context;
use Flarum\Api\Schema;
use Flarum\User\User;
use Ramon\PointSystem\Model\AvatarDecoration;
use Ramon\PointSystem\Model\CoverDecoration;
use Ramon\PointSystem\Model\NameDecoration;
use Ramon\PointSystem\Model\PostHighlightDecoration;
use Ramon\PointSystem\Model\ShopClaim;
use Ramon\PointSystem\Model\TitleDecoration;
use Ramon\PointSystem\Model\UserPoints;
use WeakMap;

class UserFields
{
    /**
     * Per-User memoization of the points row. Each user serialized triggers up
     * to 14 field getters and another batch of decoration lookups; without
     * this cache every getter would hit the DB independently. WeakMap drops
     * entries as soon as the User instance is garbage-collected, so it doesn't
     * leak across requests in long-running workers (queue, octane).
     *
     * @var WeakMap<User, ?UserPoints>
     */
    protected WeakMap $pointsCache;

    /**
     * Per-User memoization for the four single-decoration lookups (avatar,
     * name, title, cover, post-highlight) keyed by `{type}:{id}`. Most users
     * have at most one equipped item per type, so each user contributes ~0-5
     * entries.
     *
     * @var WeakMap<User, array<string, AvatarDecoration|NameDecoration|CoverDecoration|TitleDecoration|PostHighlightDecoration|null>>
     */
    protected WeakMap $decorationCache;

    public function __construct()
    {
        $this->pointsCache = new WeakMap();
        $this->decorationCache = new WeakMap();
    }

    public function __invoke(): array
    {
        return [
            Schema\Integer::make('pointBalance')
                ->visible(fn (User $user, Context $context) => $this->canSeePoints($user, $context))
                ->get(fn (User $user) => $this->points($user)?->balance ?? 0),

            Schema\Integer::make('pointLifetime')
                ->visible(fn (User $user, Context $context) => $this->canSeePoints($user, $context))
                ->get(fn (User $user) => $this->points($user)?->lifetime ?? 0),

            Schema\Integer::make('equippedAvatarDecorationId')
                ->nullable()
                ->get(fn (User $user) => $this->points($user)?->current_avatar_decoration_id),

            Schema\Str::make('equippedAvatarDecorationUrl')
                ->nullable()
                ->get(function (User $user): ?string {
                    $id = $this->points($user)?->current_avatar_decoration_id;
                    if (! $id) {
                        return null;
                    }
                    $deco = $this->decoration($user, AvatarDecoration::class, $id);
                    return $deco?->image_path;
                }),

            Schema\Integer::make('equippedNameDecorationId')
                ->nullable()
                ->get(fn (User $user) => $this->points($user)?->current_name_decoration_id),

            Schema\Str::make('equippedNameDecorationSlug')
                ->nullable()
                ->get(function (User $user): ?string {
                    $id = $this->points($user)?->current_name_decoration_id;
                    if (! $id) {
                        return null;
                    }
                    return $this->decoration($user, NameDecoration::class, $id)?->slug;
                }),

            Schema\Integer::make('equippedCoverDecorationId')
                ->nullable()
                ->get(fn (User $user) => $this->points($user)?->current_cover_decoration_id),

            Schema\Str::make('equippedCoverDecorationUrl')
                ->nullable()
                ->get(function (User $user): ?string {
                    $id = $this->points($user)?->current_cover_decoration_id;
                    if (! $id) {
                        return null;
                    }
                    return $this->decoration($user, CoverDecoration::class, $id)?->image_path;
                }),

            Schema\Integer::make('equippedTitleDecorationId')
                ->nullable()
                ->get(fn (User $user) => $this->points($user)?->current_title_decoration_id),

            Schema\Str::make('equippedTitleDecorationSlug')
                ->nullable()
                ->get(function (User $user): ?string {
                    $id = $this->points($user)?->current_title_decoration_id;
                    if (! $id) {
                        return null;
                    }
                    return $this->decoration($user, TitleDecoration::class, $id)?->slug;
                }),

            Schema\Str::make('equippedTitleDecorationText')
                ->nullable()
                ->get(function (User $user): ?string {
                    $id = $this->points($user)?->current_title_decoration_id;
                    if (! $id) {
                        return null;
                    }
                    return $this->decoration($user, TitleDecoration::class, $id)?->title_text;
                }),

            Schema\Integer::make('equippedPostHighlightDecorationId')
                ->nullable()
                ->get(fn (User $user) => $this->points($user)?->current_post_hl_decoration_id),

            Schema\Str::make('equippedPostHighlightDecorationSlug')
                ->nullable()
                ->get(function (User $user): ?string {
                    $id = $this->points($user)?->current_post_hl_decoration_id;
                    if (! $id) {
                        return null;
                    }
                    return $this->decoration($user, PostHighlightDecoration::class, $id)?->slug;
                }),

            Schema\Arr::make('ownedDecorationIds')
                ->visible(function (User $user, Context $context) {
                    return $context->getActor()->id === $user->id;
                })
                ->get(function (User $user) {
                    return ShopClaim::where('user_id', $user->id)
                        ->get(['item_type', 'item_id'])
                        ->map(fn ($c) => ['type' => $c->item_type, 'id' => $c->item_id])
                        ->toArray();
                }),
        ];
    }

    /**
     * Read-side accessor — never writes. Memoized per-User via WeakMap so the
     * 14 field getters serialized per user fire a single SELECT instead of
     * 14. The first-time row creation lives in {@see \Ramon\PointSystem\Listener\InitUserPoints}
     * that fires on {@see \Flarum\User\Event\Registered}, so a missing row
     * here just means the user pre-dates the extension; callers treat null
     * as "balance = 0".
     */
    protected function points(User $user): ?UserPoints
    {
        // Use offsetExists (not isset) — isset returns false for stored nulls,
        // and users that pre-date the extension legitimately have a null row,
        // which we must cache to avoid hitting the DB on every field getter.
        if (! $this->pointsCache->offsetExists($user)) {
            $this->pointsCache[$user] = UserPoints::where('user_id', $user->id)->first();
        }
        return $this->pointsCache[$user];
    }

    /**
     * Memoized single-decoration lookup. The five equipped-decoration fields
     * resolve their FK to either a slug, title text, or image path; the same
     * row is reused across multiple getters (slug + title text on TitleDeco).
     * Cache scope is per-User instance so concurrent serializations don't
     * cross-pollute, but two getters touching the same row on the same user
     * collapse to one SELECT.
     *
     * @template T of \Flarum\Database\AbstractModel
     * @param  class-string<T>  $class
     * @return T|null
     */
    protected function decoration(User $user, string $class, int $id)
    {
        $key = $class.':'.$id;
        $entries = $this->decorationCache[$user] ?? [];
        if (! array_key_exists($key, $entries)) {
            $entries[$key] = $class::find($id);
            $this->decorationCache[$user] = $entries;
        }
        return $entries[$key];
    }

    /**
     * The owner always sees their own points. Managers always do.
     * Everyone else (including guests) only sees them if the admin granted
     * the `pointSystem.viewOthers` permission to their group.
     */
    protected function canSeePoints(User $user, Context $context): bool
    {
        $actor = $context->getActor();
        if ($actor->id && $actor->id === $user->id) {
            return true;
        }
        if ($actor->hasPermission('pointSystem.manage')) {
            return true;
        }
        return $actor->hasPermission('pointSystem.viewOthers');
    }
}
