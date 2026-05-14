<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        if ($schema->hasColumn('point_system_user_points', 'current_cover_decoration_id')) {
            return;
        }
        $schema->table('point_system_user_points', function (Blueprint $table) {
            $table->unsignedInteger('current_cover_decoration_id')->nullable()->after('current_name_decoration_id');
        });
    },
    'down' => function (Builder $schema) {
        if (! $schema->hasColumn('point_system_user_points', 'current_cover_decoration_id')) {
            return;
        }
        $schema->table('point_system_user_points', function (Blueprint $table) {
            $table->dropColumn('current_cover_decoration_id');
        });
    },
];
