<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        $schema->table('point_system_user_points', function (Blueprint $table) use ($schema) {
            if (! $schema->hasColumn('point_system_user_points', 'current_title_decoration_id')) {
                $table->unsignedInteger('current_title_decoration_id')->nullable()->after('current_cover_decoration_id');
            }
            if (! $schema->hasColumn('point_system_user_points', 'current_post_hl_decoration_id')) {
                $table->unsignedInteger('current_post_hl_decoration_id')->nullable()->after('current_title_decoration_id');
            }
        });
    },
    'down' => function (Builder $schema) {
        $schema->table('point_system_user_points', function (Blueprint $table) use ($schema) {
            if ($schema->hasColumn('point_system_user_points', 'current_title_decoration_id')) {
                $table->dropColumn('current_title_decoration_id');
            }
            if ($schema->hasColumn('point_system_user_points', 'current_post_hl_decoration_id')) {
                $table->dropColumn('current_post_hl_decoration_id');
            }
        });
    },
];
