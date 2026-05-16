<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

/**
 * Adds a `quantity` column to `point_system_claims` so a user can own
 * multiple copies of the same (item_type, item_id) instead of having one
 * row per ownership.
 *
 * Why: the trade subsystem flips claim ownership by `UPDATE ... SET
 * user_id = recipient`, which collides with the existing UNIQUE key
 * `(user_id, item_type, item_id)` whenever the recipient already owns the
 * item. Stackable quantities let the shop, grants, and trades all merge
 * naturally into a single row (`+1` on receive, `-1` on give-away, delete
 * on `0`) instead of bouncing off the integrity constraint with a 422.
 *
 * Backfill: every existing claim row represents exactly 1 copy → default
 * to 1 for both new and existing rows. The unique key on
 * (user_id, item_type, item_id) STAYS — it now enforces "one row per
 * (user, item) with a quantity counter" rather than "one row per copy".
 */
return [
    'up' => function (Builder $schema) {
        if (! $schema->hasTable('point_system_claims')) return;
        if ($schema->hasColumn('point_system_claims', 'quantity')) return;

        $schema->table('point_system_claims', function (Blueprint $table) {
            $table->unsignedInteger('quantity')->default(1)->after('item_id');
        });
    },
    'down' => function (Builder $schema) {
        if (! $schema->hasTable('point_system_claims')) return;
        if (! $schema->hasColumn('point_system_claims', 'quantity')) return;

        $schema->table('point_system_claims', function (Blueprint $table) {
            $table->dropColumn('quantity');
        });
    },
];
