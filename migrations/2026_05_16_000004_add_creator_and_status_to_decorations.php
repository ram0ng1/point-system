<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

/**
 * Enables a user-submission workflow: regular users can submit decoration
 * designs, which sit in a `pending` queue until an admin approves or rejects.
 *
 * Added to every decoration table:
 *   - creator_id   nullable FK → users. NULL = legacy / admin-created (i.e.
 *                  no specific user attribution). Set to the submitter when
 *                  a non-manager creates the row.
 *   - status       varchar(20), default 'approved'. Values:
 *                    'approved' — visible in shop, equippable, etc.
 *                    'pending'  — waiting on admin moderation; visible only
 *                                 to the submitter (and managers) until
 *                                 approved.
 *                    'rejected' — admin declined; stays hidden, history
 *                                 preserved for audit.
 *
 * Backfill: existing rows default to 'approved' via the column default, no
 * data migration needed. The 'approved' string is intentionally not an enum
 * column (CLAUDE.md §39.2 — portable across MySQL / PostgreSQL / SQLite).
 *
 * Idempotency: each step is gated on schema introspection AND wrapped in
 * try/catch. A partial first run (column added, FK / index failed) can be
 * fixed by re-running migrate — the second pass picks up where the first
 * stopped instead of hitting "duplicate column / index" SQL errors.
 */
return [
    'up' => function (Builder $schema) {
        $tables = [
            'point_system_avatar_decorations',
            'point_system_name_decorations',
            'point_system_cover_decorations',
            'point_system_title_decorations',
            'point_system_post_highlight_decorations',
        ];

        foreach ($tables as $table) {
            if (! $schema->hasTable($table)) continue;

            // ── Columns first (one Blueprint, all column-add operations
            // batched into a single ALTER TABLE).
            $schema->table($table, function (Blueprint $t) use ($schema, $table) {
                if (! $schema->hasColumn($table, 'creator_id')) {
                    $t->unsignedInteger('creator_id')->nullable();
                }
                if (! $schema->hasColumn($table, 'status')) {
                    $t->string('status', 20)->default('approved');
                }
            });

            // ── Foreign key — separate ALTER so the column exists first.
            // try/catch swallows "duplicate FK" on a re-run; the FK already
            // being there is fine.
            try {
                $schema->table($table, function (Blueprint $t) {
                    $t->foreign('creator_id')->references('id')->on('users')->nullOnDelete();
                });
            } catch (\Throwable) {
                // FK already in place — no-op.
            }

            // ── Indexes — try/catch swallows the "duplicate index name"
            // error so a partial first run doesn't block subsequent migrates.
            try {
                $schema->table($table, function (Blueprint $t) use ($table) {
                    $t->index(['status'], "{$table}_status_idx");
                });
            } catch (\Throwable) {
                // Index already in place.
            }
            try {
                $schema->table($table, function (Blueprint $t) use ($table) {
                    $t->index(['creator_id', 'status'], "{$table}_creator_status_idx");
                });
            } catch (\Throwable) {
                // Index already in place.
            }
        }
    },
    'down' => function (Builder $schema) {
        $tables = [
            'point_system_avatar_decorations',
            'point_system_name_decorations',
            'point_system_cover_decorations',
            'point_system_title_decorations',
            'point_system_post_highlight_decorations',
        ];

        foreach ($tables as $table) {
            if (! $schema->hasTable($table)) continue;

            // Each operation in its own try/catch so a missing index / FK /
            // column doesn't block the rest of the rollback.
            try {
                $schema->table($table, function (Blueprint $t) use ($table) {
                    $t->dropIndex("{$table}_status_idx");
                });
            } catch (\Throwable) {}
            try {
                $schema->table($table, function (Blueprint $t) use ($table) {
                    $t->dropIndex("{$table}_creator_status_idx");
                });
            } catch (\Throwable) {}
            try {
                $schema->table($table, function (Blueprint $t) {
                    $t->dropForeign(['creator_id']);
                });
            } catch (\Throwable) {}

            $schema->table($table, function (Blueprint $t) use ($schema, $table) {
                if ($schema->hasColumn($table, 'creator_id')) {
                    $t->dropColumn('creator_id');
                }
                if ($schema->hasColumn($table, 'status')) {
                    $t->dropColumn('status');
                }
            });
        }
    },
];
