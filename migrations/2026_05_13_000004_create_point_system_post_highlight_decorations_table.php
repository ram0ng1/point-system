<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        if (! $schema->hasTable('point_system_post_highlight_decorations')) {
            $schema->create('point_system_post_highlight_decorations', function (Blueprint $table) {
                $table->increments('id');
                $table->string('name', 100);
                $table->string('slug', 100)->unique();        // `ps-posthl-{slug}` CSS hook
                $table->string('description', 500)->nullable();
                $table->string('preset', 50)->nullable();     // gold-border, glow-blue, ribbon, etc.
                $table->text('custom_css')->nullable();
                $table->integer('price')->default(0);
                $table->boolean('is_enabled')->default(true);
                $table->integer('sort')->default(0);
                $table->timestamps();
            });
        }
    },
    'down' => function (Builder $schema) {
        $schema->dropIfExists('point_system_post_highlight_decorations');
    },
];
