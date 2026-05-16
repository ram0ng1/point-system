<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

/**
 * Habbo-style user-to-user trading.
 *
 * Two tables:
 *
 *   point_system_trades — one row per trade session. Tracks the two
 *   participants, what each side offers in points, the accept toggles,
 *   the current status, and audit columns.
 *
 *   point_system_trade_items — pivot for the decorations each side puts on
 *   the table. Owner_id identifies which side is offering this row's item;
 *   it must equal either initiator_id or recipient_id of the parent trade.
 *
 * Status values:
 *   pending   — open, either side can edit / accept / cancel
 *   completed — executed; items + points have transferred
 *   cancelled — aborted by one party or invalidated
 *
 * Indexes:
 *   - (initiator_id, status) and (recipient_id, status) for the active-
 *     trades list views on the user side
 *   - (trade_id, owner_id) on items for the per-side filter inside the
 *     trade window
 *   - UNIQUE (trade_id, item_type, item_id) — same physical decoration can
 *     only appear once on a given trade (one side or the other, never both)
 */
return [
    'up' => function (Builder $schema) {
        if (! $schema->hasTable('point_system_trades')) {
            $schema->create('point_system_trades', function (Blueprint $t) {
                $t->increments('id');
                $t->unsignedInteger('initiator_id');
                $t->unsignedInteger('recipient_id');
                $t->unsignedInteger('initiator_points')->default(0);
                $t->unsignedInteger('recipient_points')->default(0);
                $t->boolean('initiator_accepted')->default(false);
                $t->boolean('recipient_accepted')->default(false);
                $t->string('status', 20)->default('pending');
                $t->unsignedInteger('cancelled_by_id')->nullable();
                $t->dateTime('completed_at')->nullable();
                $t->dateTime('cancelled_at')->nullable();
                $t->timestamps();

                $t->foreign('initiator_id')->references('id')->on('users')->cascadeOnDelete();
                $t->foreign('recipient_id')->references('id')->on('users')->cascadeOnDelete();
                $t->foreign('cancelled_by_id')->references('id')->on('users')->nullOnDelete();

                $t->index(['initiator_id', 'status'], 'trades_initiator_status_idx');
                $t->index(['recipient_id', 'status'], 'trades_recipient_status_idx');
            });
        }

        if (! $schema->hasTable('point_system_trade_items')) {
            $schema->create('point_system_trade_items', function (Blueprint $t) {
                $t->increments('id');
                $t->unsignedInteger('trade_id');
                $t->unsignedInteger('owner_id');
                $t->string('item_type', 40);
                $t->unsignedInteger('item_id');
                $t->timestamps();

                $t->foreign('trade_id')->references('id')->on('point_system_trades')->cascadeOnDelete();
                $t->foreign('owner_id')->references('id')->on('users')->cascadeOnDelete();

                $t->unique(['trade_id', 'item_type', 'item_id'], 'trade_items_unique_idx');
                $t->index(['trade_id', 'owner_id'], 'trade_items_side_idx');
            });
        }
    },
    'down' => function (Builder $schema) {
        $schema->dropIfExists('point_system_trade_items');
        $schema->dropIfExists('point_system_trades');
    },
];
