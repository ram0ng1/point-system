<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Support;

use Flarum\User\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * SQL helper applied by every decoration Resource scope() so the public
 * catalog ALWAYS hides `pending` / `rejected` submissions from regular
 * users — but lets the SUBMITTER see their own pending row (so the user
 * gets feedback that their submission was received and is waiting).
 *
 * Managers bypass this entirely (they manage the queue from the admin
 * "Pending submissions" panel).
 *
 * Combine with `applyShopOrOwnedScope` for the shop-side filtering. The
 * usual call order in a Resource scope():
 *
 *   if (! $actor->hasPermission('pointSystem.manage')) {
 *       $query->where('is_enabled', true);
 *       SubmissionScope::apply($query, $actor);
 *       ItemAvailability::applyShopOrOwnedScope($query, $actor, $type);
 *   }
 *
 * Each helper is composable — they all append constraints, never reset
 * the builder.
 *
 * RESILIENCE: the `status` and `creator_id` columns are added by the
 * 2026_05_16_000004 migration. If an admin upgrades the extension code
 * BEFORE running `php flarum migrate`, the table is missing those columns
 * and the SQL filter would throw "Unknown column 'status' in 'where
 * clause'". We sniff the table once via the schema builder and degrade to
 * a no-op when the migration is pending — the forum keeps rendering with
 * pre-submission semantics (every is_enabled row visible) until the admin
 * runs the migration.
 */
final class SubmissionScope
{
    public static function apply(Builder $query, ?User $actor): void
    {
        if (! SubmissionColumns::readyFor($query)) {
            return;
        }

        $query->where(function (Builder $q) use ($actor) {
            $q->where('status', 'approved');
            if ($actor instanceof User && ! $actor->isGuest()) {
                $q->orWhere(function (Builder $self) use ($actor) {
                    $self->where('creator_id', (int) $actor->id)
                         ->whereIn('status', ['pending', 'rejected']);
                });
            }
        });
    }

}
