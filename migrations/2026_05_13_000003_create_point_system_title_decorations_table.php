<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        if (! $schema->hasTable('point_system_title_decorations')) {
            $schema->create('point_system_title_decorations', function (Blueprint $table) {
                $table->increments('id');
                $table->string('name', 100);
                $table->string('slug', 100)->unique();        // `ps-title-{slug}` CSS hook
                $table->string('description', 500)->nullable();
                $table->string('title_text', 60);             // user-visible badge text ("Veterano", "Mecenas")
                $table->string('color', 24)->nullable();      // optional accent colour (CSS value)
                $table->text('custom_css')->nullable();
                $table->integer('price')->default(0);
                $table->boolean('is_enabled')->default(true);
                $table->integer('sort')->default(0);
                $table->timestamps();
            });
        }
    },
    'down' => function (Builder $schema) {
        $schema->dropIfExists('point_system_title_decorations');
    },
];
