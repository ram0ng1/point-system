<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Support;

use Carbon\Carbon;
use Flarum\Database\AbstractModel;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Builder;
use Ramon\PointSystem\Model\ShopClaim;

/**
 * Encapsulates the shared availability rules for shop items.
 *
 * Every shop-item family (AvatarDecoration, NameDecoration, …, GroupOffer)
 * carries the same six columns added by the 2026_05_16 migration:
 *
 *   - max_claims        / claim_count
 *   - available_from    / available_until
 *   - is_listed
 *   - allowed_group_ids
 *
 * Putting the rules in one helper keeps the four resource scopes, the claim
 * controller and the grant controller from drifting apart — drift is the
 * known recurrence vector for half-enforced restrictions (CLAUDE.md §38.6).
 *
 * Public surface:
 *   - applyShopScope():   SQL filter used by every resource's scope() so the
 *                          public catalog never includes unlisted or out-of-
 *                          window items.
 *   - reasonNotClaimable(): server-side gate for ClaimItemController. Returns
 *                          null when the item is claimable for the actor;
 *                          otherwise returns a stable machine code string
 *                          ('expired' / 'sold_out' / 'group_restricted' / ...)
 *                          that the controller maps to a 422 with a translator
 *                          key on the frontend.
 *   - userGroupIds():     normalised list of the actor's group ids (incl. the
 *                          implicit MEMBER_ID / GUEST_ID; mirrors core).
 */
class ItemAvailability
{
    /**
     * Returns null if the item is claimable; otherwise a stable code string.
     *
     * Caller is the actor attempting to claim. Pass `null` for the grant
     * flow when the admin is acting on someone else's behalf — group
     * restrictions still apply to the RECIPIENT, so pass the recipient there.
     */
    public static function reasonNotClaimable(AbstractModel $item, ?User $actor): ?string
    {
        if (! (bool) ($item->is_enabled ?? true)) {
            return 'disabled';
        }

        $now = Carbon::now();
        $from = $item->available_from ?? null;
        $until = $item->available_until ?? null;
        if ($from instanceof \DateTimeInterface && $now->lt(Carbon::instance($from))) {
            return 'not_yet_available';
        }
        if ($until instanceof \DateTimeInterface && $now->gt(Carbon::instance($until))) {
            return 'expired';
        }

        $max = $item->max_claims ?? null;
        if (is_int($max) && $max > 0 && (int) ($item->claim_count ?? 0) >= $max) {
            return 'sold_out';
        }

        $allowed = self::allowedGroupIds($item);
        if ($allowed !== null) {
            if (! $actor instanceof User || $actor->isGuest()) {
                return 'group_restricted';
            }
            $userIds = self::userGroupIds($actor);
            if (empty(array_intersect($allowed, $userIds))) {
                return 'group_restricted';
            }
        }

        return null;
    }

    /**
     * Apply the catalog-listing filters: only items that:
     *   - is_listed = 1 (hidden items are reachable only via direct grant)
     *   - within their availability window (or window unset)
     *   - not sold out
     *   - either unrestricted on group OR include one of the actor's groups
     *
     * This runs in the resource scope() so non-managers never SEE items they
     * can't claim. The `assertClaimable` check inside the controller stays
     * authoritative — scope is hint, controller is gate.
     */
    public static function applyShopScope(Builder $query, ?User $actor): void
    {
        $now = Carbon::now();

        $query->where('is_listed', true);

        $query->where(function (Builder $q) use ($now) {
            $q->whereNull('available_from')->orWhere('available_from', '<=', $now);
        });
        $query->where(function (Builder $q) use ($now) {
            $q->whereNull('available_until')->orWhere('available_until', '>=', $now);
        });

        // Sold-out filter: either max_claims is unset (NULL = unlimited) or
        // claim_count < max_claims. Wrapped so it composes with the date
        // filters above as an AND.
        $query->where(function (Builder $q) {
            $q->whereNull('max_claims')->orWhereColumn('claim_count', '<', 'max_claims');
        });

        // Group-restriction filter: applied only for non-guest actors so
        // guests still see the "login to claim" placeholder for unrestricted
        // items (parity with how the existing pricing already behaves). When
        // a user IS logged in, hide every item whose allowed_group_ids excludes
        // every one of their groups. NULL/empty allowed_group_ids = open.
        if ($actor instanceof User && ! $actor->isGuest()) {
            $groupIds = self::userGroupIds($actor);
            $query->where(function (Builder $q) use ($groupIds) {
                $q->whereNull('allowed_group_ids')
                  ->orWhere('allowed_group_ids', '')
                  ->orWhere('allowed_group_ids', '[]');
                foreach ($groupIds as $gid) {
                    $q->orWhereJsonContains('allowed_group_ids', (int) $gid);
                }
            });
        } else {
            // Guests: only show unrestricted items.
            $query->where(function (Builder $q) {
                $q->whereNull('allowed_group_ids')
                  ->orWhere('allowed_group_ids', '')
                  ->orWhere('allowed_group_ids', '[]');
            });
        }
    }

    /**
     * Like {@see applyShopScope} but ALSO includes items the actor already
     * owns (via {@see ShopClaim}), regardless of their is_enabled / is_listed
     * / availability-window / group-restriction state.
     *
     * Use this for the public catalog payload (ForumAttributes) so an item
     * the admin later disables / unlists / lets expire does not vanish from
     * the inventories of users who already purchased it. The shop-side UI
     * filters the result by `isAvailable` to keep disabled items out of the
     * "buyable" grid — but the "My decorations" page receives the full set so
     * the user can keep wearing what they own.
     *
     * Group offers do not have a ShopClaim equivalent — membership lives in
     * the group_user pivot — so call this helper only for the five decoration
     * families.
     *
     * `$preFetchedOwnedIds` é o caminho rápido para ForumAttributes, onde os
     * cinco tipos de decoração são consultados em sequência: passe a lista
     * já lida (uma única `SELECT item_type, item_id FROM shop_claims WHERE
     * user_id = ?`) e este helper pula o SELECT por tipo. Quando `null`,
     * mantém o comportamento legado de uma query interna — keeps the
     * stand-alone callers (Resource scope, etc.) working without changes.
     */
    public static function applyShopOrOwnedScope(
        Builder $query,
        ?User $actor,
        string $itemType,
        ?array $preFetchedOwnedIds = null,
    ): void {
        if ($preFetchedOwnedIds !== null) {
            $ownedIds = $preFetchedOwnedIds;
        } elseif ($actor instanceof User && ! $actor->isGuest()) {
            $ownedIds = ShopClaim::where('user_id', $actor->id)
                ->where('item_type', $itemType)
                ->pluck('item_id')
                ->all();
        } else {
            $ownedIds = [];
        }

        $query->where(function (Builder $q) use ($actor, $ownedIds) {
            // Path A: items that pass every shop filter.
            $q->where(function (Builder $sub) use ($actor) {
                $sub->where('is_enabled', true);
                self::applyShopScope($sub, $actor);
            });

            // Path B: items the actor already owns. The OR keeps them in the
            // payload even after the admin disables / unlists / lets them
            // expire — so the user's inventory does not vanish from under
            // them. Skipped when the list is empty so we never emit
            // `OR id IN ()`, which MySQL parses as a syntax error.
            if (! empty($ownedIds)) {
                $q->orWhereIn('id', $ownedIds);
            }
        });
    }

    /**
     * Carrega EM UMA query todos os `(item_type, item_id)` que o ator possui,
     * devolvendo um mapa `[tipo => int[]]` pronto para alimentar cinco
     * chamadas consecutivas de {@see applyShopOrOwnedScope} sem disparar
     * cinco SELECTs (ForumAttributes original fazia exatamente isso).
     * Devolve mapa vazio para guest.
     *
     * @return array<string, int[]>
     */
    public static function ownedIdsByType(?User $actor): array
    {
        if (! $actor instanceof User || $actor->isGuest()) {
            return [];
        }
        $rows = ShopClaim::where('user_id', $actor->id)
            ->get(['item_type', 'item_id']);

        $map = [];
        foreach ($rows as $row) {
            $map[(string) $row->item_type][] = (int) $row->item_id;
        }
        return $map;
    }

    /**
     * Read the actor's group ids, normalised to ints with duplicates removed
     * and MEMBER_ID always present for non-guests. Mirrors how core resolves
     * permissions so the SQL filter and the post-claim assert agree.
     */
    public static function userGroupIds(User $user): array
    {
        $ids = $user->groups->pluck('id')->map(fn ($v) => (int) $v)->all();
        if (! $user->isGuest()) {
            // MEMBER_ID — registered users implicitly belong to it even when
            // not pivoted in `group_user`.
            $ids[] = \Flarum\Group\Group::MEMBER_ID;
        }
        return array_values(array_unique($ids));
    }

    /**
     * Fill the shared availability columns on a model from a JSON:API attrs
     * array. Always called from a manager-gated endpoint (no actor check
     * here). Empty / null / "" coerces to NULL on the column so the admin
     * can clear a limit/window.
     */
    public static function fillFromAttrs(AbstractModel $item, array $attrs): void
    {
        if (array_key_exists('maxClaims', $attrs)) {
            $v = $attrs['maxClaims'];
            $item->max_claims = ($v === null || $v === '' || (int) $v <= 0) ? null : (int) $v;
        }
        if (array_key_exists('availableFrom', $attrs)) {
            $item->available_from = self::parseDate($attrs['availableFrom']);
        }
        if (array_key_exists('availableUntil', $attrs)) {
            $item->available_until = self::parseDate($attrs['availableUntil']);
        }
        if (array_key_exists('isListed', $attrs)) {
            $item->is_listed = (bool) $attrs['isListed'];
        }
        if (array_key_exists('allowedGroupIds', $attrs)) {
            $raw = $attrs['allowedGroupIds'];
            if ($raw === null || $raw === '' || $raw === []) {
                $item->allowed_group_ids = null;
            } else {
                if (is_string($raw)) {
                    $decoded = json_decode($raw, true);
                    $raw = is_array($decoded) ? $decoded : [];
                }
                if (! is_array($raw)) {
                    $item->allowed_group_ids = null;
                } else {
                    $ids = array_values(array_filter(array_map(static function ($v) {
                        return is_numeric($v) ? (int) $v : null;
                    }, $raw), static fn ($v) => $v !== null && $v > 0));
                    $item->allowed_group_ids = count($ids) ? array_values(array_unique($ids)) : null;
                }
            }
        }
    }

    private static function parseDate(mixed $value): ?Carbon
    {
        if ($value === null || $value === '' || $value === false) return null;
        try {
            return Carbon::parse((string) $value);
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * Returns the allowed_group_ids list as an int array, or null when the
     * column is empty (= unrestricted). Defensive against legacy rows where
     * the column might hold a JSON-encoded string or be NULL.
     */
    public static function allowedGroupIds(AbstractModel $item): ?array
    {
        $raw = $item->allowed_group_ids ?? null;
        if ($raw === null) return null;

        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            $raw = is_array($decoded) ? $decoded : null;
        }
        if (! is_array($raw) || count($raw) === 0) return null;

        $ids = array_values(array_filter(array_map(static function ($v) {
            return is_numeric($v) ? (int) $v : null;
        }, $raw), static fn ($v) => $v !== null && $v > 0));

        return count($ids) ? $ids : null;
    }
}
