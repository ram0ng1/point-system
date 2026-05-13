<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

return [
    'up' => function (Builder $schema) {
        if (! $schema->hasTable('point_system_transactions')) {
            $schema->create('point_system_transactions', function (Blueprint $table) {
                $table->increments('id');
                $table->unsignedInteger('user_id');
                $table->integer('amount');                  // positive = credit, negative = debit
                $table->string('reason', 64);                // e.g. discussion.started, post.posted, like.received, shop.claim
                $table->string('reference_type', 64)->nullable();
                $table->unsignedInteger('reference_id')->nullable();
                $table->text('meta')->nullable();
                $table->timestamp('created_at')->useCurrent();

                $table->index(['user_id', 'created_at']);
                $table->index(['reason']);
                $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            });
        }
    },
    'down' => function (Builder $schema) {
        $schema->dropIfExists('point_system_transactions');
    },
];
