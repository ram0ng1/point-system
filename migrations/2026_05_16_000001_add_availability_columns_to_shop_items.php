<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

/**
 * Adds shared availability / restriction / visibility columns to every shop item
 * family (avatar, name, cover, title, post-hl decorations + group offers).
 *
 *   - max_claims         INT UNSIGNED NULL — null = unlimited; otherwise the
 *                        claim_count cap before the item locks out.
 *   - claim_count        INT UNSIGNED default 0 — incremented atomically
 *                        inside ClaimItemController / GrantItemController.
 *   - available_from     DATETIME NULL — null = always available; otherwise
 *                        the lower bound of the claim window.
 *   - available_until    DATETIME NULL — null = no expiry.
 *   - is_listed          TINYINT default 1 — when 0 the item is hidden from
 *                        the public shop catalog and can only be granted to
 *                        a specific user via the admin "Grant" action.
 *   - allowed_group_ids  TEXT NULL — JSON-encoded list of group IDs allowed
 *                        to purchase. Null/empty = unrestricted.
 *
 * Additionally, AvatarDecoration and CoverDecoration get an `image_url`
 * column so admins can point at a remote image instead of uploading. The
 * existing `image_path` column stays for self-hosted assets; `image_url` is
 * only populated when the admin chose the URL path.
 */
return [
    'up' => function (Builder $schema) {
        $tables = [
            'point_system_avatar_decorations',
            'point_system_name_decorations',
            'point_system_cover_decorations',
            'point_system_title_decorations',
            'point_system_post_highlight_decorations',
            'point_system_group_offers',
        ];

        foreach ($tables as $table) {
            if (! $schema->hasTable($table)) continue;
            $schema->table($table, function (Blueprint $t) use ($schema, $table) {
                if (! $schema->hasColumn($table, 'max_claims')) {
                    $t->unsignedInteger('max_claims')->nullable();
                }
                if (! $schema->hasColumn($table, 'claim_count')) {
                    $t->unsignedInteger('claim_count')->default(0);
                }
                if (! $schema->hasColumn($table, 'available_from')) {
                    $t->dateTime('available_from')->nullable();
                }
                if (! $schema->hasColumn($table, 'available_until')) {
                    $t->dateTime('available_until')->nullable();
                }
                if (! $schema->hasColumn($table, 'is_listed')) {
                    $t->boolean('is_listed')->default(true);
                }
                if (! $schema->hasColumn($table, 'allowed_group_ids')) {
                    $t->text('allowed_group_ids')->nullable();
                }
            });
        }

        // Image-URL alternative — only for image-bearing decoration families.
        foreach (['point_system_avatar_decorations', 'point_system_cover_decorations'] as $table) {
            if (! $schema->hasTable($table)) continue;
            $schema->table($table, function (Blueprint $t) use ($schema, $table) {
                if (! $schema->hasColumn($table, 'image_url')) {
                    $t->string('image_url', 1024)->nullable();
                }
                // Existing image_path is `string(255)` and `NOT NULL`. When the
                // admin chooses the URL path the file column needs to be empty,
                // so we relax it to nullable here. Old rows keep their value.
                if ($schema->hasColumn($table, 'image_path')) {
                    $t->string('image_path', 255)->nullable()->change();
                }
            });
        }
    },
    'down' => function (Builder $schema) {
        $columns = ['max_claims', 'claim_count', 'available_from', 'available_until', 'is_listed', 'allowed_group_ids'];
        $tables = [
            'point_system_avatar_decorations',
            'point_system_name_decorations',
            'point_system_cover_decorations',
            'point_system_title_decorations',
            'point_system_post_highlight_decorations',
            'point_system_group_offers',
        ];
        foreach ($tables as $table) {
            if (! $schema->hasTable($table)) continue;
            $schema->table($table, function (Blueprint $t) use ($schema, $table, $columns) {
                foreach ($columns as $col) {
                    if ($schema->hasColumn($table, $col)) {
                        $t->dropColumn($col);
                    }
                }
            });
        }
        foreach (['point_system_avatar_decorations', 'point_system_cover_decorations'] as $table) {
            if (! $schema->hasTable($table)) continue;
            $schema->table($table, function (Blueprint $t) use ($schema, $table) {
                if ($schema->hasColumn($table, 'image_url')) {
                    $t->dropColumn('image_url');
                }
            });
        }
    },
];
