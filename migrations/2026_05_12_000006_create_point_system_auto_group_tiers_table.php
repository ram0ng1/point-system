<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        if (! $schema->hasTable('point_system_auto_group_tiers')) {
            $schema->create('point_system_auto_group_tiers', function (Blueprint $table) {
                $table->increments('id');
                $table->unsignedInteger('group_id');
                $table->integer('points_required');
                $table->boolean('is_enabled')->default(true);
                $table->timestamps();

                $table->unique(['group_id']);
                $table->foreign('group_id')->references('id')->on('groups')->onDelete('cascade');
            });
        }
    },
    'down' => function (Builder $schema) {
        $schema->dropIfExists('point_system_auto_group_tiers');
    },
];
