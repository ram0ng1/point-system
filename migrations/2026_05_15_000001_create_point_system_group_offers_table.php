<?php

declare(strict_types=1);

use Illuminate\Database\Schema\Blueprint;
use Illuminate\Database\Schema\Builder;

/*
 * Unifies the former point_system_auto_group_tiers table into a richer
 * "group_offers" concept: each row represents a group made available to
 * members either automatically (lifetime threshold) or via explicit purchase
 * (balance deduction) — or both, when a single group should support both
 * unlock paths.
 *
 * Existing rows are copied 1:1 with both flags set to true and `price` seeded
 * from `points_required`, preserving the legacy ClaimTierController behavior.
 */
return [
    'up' => function (Builder $schema) {
        if ($schema->hasTable('point_system_group_offers')) {
            return;
        }

        $schema->create('point_system_group_offers', function (Blueprint $table) {
            $table->increments('id');
            $table->unsignedInteger('group_id');
            $table->integer('points_required')->default(0);
            $table->integer('price')->default(0);
            $table->boolean('is_auto')->default(true);
            $table->boolean('is_purchasable')->default(false);
            $table->boolean('is_enabled')->default(true);
            $table->timestamps();

            $table->unique(['group_id']);
            $table->foreign('group_id')->references('id')->on('groups')->onDelete('cascade');
        });

        if ($schema->hasTable('point_system_auto_group_tiers')) {
            $rows = $schema->getConnection()->table('point_system_auto_group_tiers')->get();
            foreach ($rows as $row) {
                $schema->getConnection()->table('point_system_group_offers')->insert([
                    'group_id'        => (int) $row->group_id,
                    'points_required' => (int) $row->points_required,
                    'price'           => (int) $row->points_required,
                    'is_auto'         => true,
                    'is_purchasable'  => true,
                    'is_enabled'      => (bool) $row->is_enabled,
                    'created_at'      => $row->created_at ?? null,
                    'updated_at'      => $row->updated_at ?? null,
                ]);
            }
            $schema->drop('point_system_auto_group_tiers');
        }
    },
    'down' => function (Builder $schema) {
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

            if ($schema->hasTable('point_system_group_offers')) {
                $rows = $schema->getConnection()->table('point_system_group_offers')->get();
                foreach ($rows as $row) {
                    $schema->getConnection()->table('point_system_auto_group_tiers')->insert([
                        'group_id'        => (int) $row->group_id,
                        'points_required' => (int) $row->points_required,
                        'is_enabled'      => (bool) $row->is_enabled,
                        'created_at'      => $row->created_at ?? null,
                        'updated_at'      => $row->updated_at ?? null,
                    ]);
                }
            }
        }
        $schema->dropIfExists('point_system_group_offers');
    },
];
