<?php

declare(strict_types=1);

use Flarum\Group\Group;
use Illuminate\Database\Schema\Builder;

/**
 * Seeds the `pointSystem.viewShop` and `pointSystem.claim` permissions for the
 * Members group so the Rewards page is reachable and claimable out of the box.
 *
 * Without this seed a fresh install leaves the shop inaccessible to every
 * non-admin: the permissions are registered in the admin Permissions panel but
 * default to "off", so an operator has to discover and tick them manually
 * before members see anything. Companion to
 * 2026_05_16_000003_add_trade_permission, which already seeds `pointSystem.trade`
 * the same way — this brings the shop's read/claim gates in line.
 *
 * Deliberately NOT seeded: `pointSystem.manage` (admins hold every permission
 * implicitly) and `pointSystem.viewOthers` (other users' balances are
 * PII-adjacent — the admin opts that one in per group).
 *
 * Why the closure type-hints `Builder $schema` instead of `ConnectionInterface`:
 * Flarum 2's `Migrator::runClosureMigration` always passes a SchemaBuilder; a
 * `ConnectionInterface` hint fatals on TypeError when the extension is enabled.
 * The connection is taken from the builder for the data ops.
 *
 * Idempotent: skips each insert when the row already exists. The `down` removes
 * every assignment of both abilities so uninstalling doesn't leave dangling
 * permission rows pointing at a non-existent ability.
 */
return [
    'up' => function (Builder $schema) {
        $db = $schema->getConnection();

        foreach (['pointSystem.viewShop', 'pointSystem.claim'] as $permission) {
            $exists = $db->table('group_permission')
                ->where('group_id', Group::MEMBER_ID)
                ->where('permission', $permission)
                ->exists();
            if (! $exists) {
                $db->table('group_permission')->insert([
                    'group_id'   => Group::MEMBER_ID,
                    'permission' => $permission,
                ]);
            }
        }
    },
    'down' => function (Builder $schema) {
        $schema->getConnection()
            ->table('group_permission')
            ->whereIn('permission', ['pointSystem.viewShop', 'pointSystem.claim'])
            ->delete();
    },
];
