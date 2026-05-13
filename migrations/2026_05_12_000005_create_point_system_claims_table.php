<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        if (! $schema->hasTable('point_system_claims')) {
            $schema->create('point_system_claims', function (Blueprint $table) {
                $table->increments('id');
                $table->unsignedInteger('user_id');
                $table->string('item_type', 32);   // avatar_decoration | name_decoration
                $table->unsignedInteger('item_id');
                $table->integer('price_paid');
                $table->timestamp('claimed_at')->useCurrent();

                $table->unique(['user_id', 'item_type', 'item_id']);
                $table->index(['user_id']);
                $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            });
        }
    },
    'down' => function (Builder $schema) {
        $schema->dropIfExists('point_system_claims');
    },
];
