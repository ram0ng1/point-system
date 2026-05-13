<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        if (! $schema->hasTable('point_system_avatar_decorations')) {
            $schema->create('point_system_avatar_decorations', function (Blueprint $table) {
                $table->increments('id');
                $table->string('name', 100);
                $table->string('description', 500)->nullable();
                $table->string('image_path', 255);          // relative to assets dir
                $table->boolean('is_animated')->default(false);
                $table->integer('price')->default(0);
                $table->boolean('is_enabled')->default(true);
                $table->integer('sort')->default(0);
                $table->timestamps();
            });
        }
    },
    'down' => function (Builder $schema) {
        $schema->dropIfExists('point_system_avatar_decorations');
    },
];
