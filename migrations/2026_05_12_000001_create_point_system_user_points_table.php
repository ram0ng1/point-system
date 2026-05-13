<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        if (! $schema->hasTable('point_system_user_points')) {
            $schema->create('point_system_user_points', function (Blueprint $table) {
                $table->increments('id');
                $table->unsignedInteger('user_id')->unique();
                $table->integer('balance')->default(0);
                $table->integer('lifetime')->default(0);
                $table->unsignedInteger('current_avatar_decoration_id')->nullable();
                $table->unsignedInteger('current_name_decoration_id')->nullable();
                $table->timestamp('last_daily_bonus_at')->nullable();
                $table->timestamps();

                $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            });
        }
    },
    'down' => function (Builder $schema) {
        $schema->dropIfExists('point_system_user_points');
    },
];
