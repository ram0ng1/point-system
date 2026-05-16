<?php

declare(strict_types=1);

use Flarum\Group\Group;
use Illuminate\Database\Schema\Builder;

/**
 * Seeds the `pointSystem.trade` permission for the Members group so authenticated
 * users can open trade sessions out of the box. Admins can restrict this per
 * group via the Permissions tab (e.g., only members of a "Trusted" group can
 * trade) — that's the standard Flarum permission UX.
 *
 * Why the closure type-hints `Builder $schema` instead of `ConnectionInterface`:
 * Flarum 2's `Migrator::runClosureMigration` hardcodes
 * `call_user_func($migration[$direction], $this->connection->getSchemaBuilder())`
 * — it ALWAYS passes a SchemaBuilder. A closure type-hinted as
 * `ConnectionInterface` (the pattern CLAUDE.md §26 documents from Flarum 1)
 * fatals on TypeError as soon as the extension is enabled. We get the
 * connection from the builder for the actual data ops.
 *
 * Idempotent: skips the insert when the row already exists. The `down`
 * removes every assignment of `pointSystem.trade` so uninstalling the
 * extension doesn't leave dangling permission rows pointing at a non-
 * existent ability.
 */
return [
    'up' => function (Builder $schema) {
        $db = $schema->getConnection();

        $exists = $db->table('group_permission')
            ->where('group_id', Group::MEMBER_ID)
            ->where('permission', 'pointSystem.trade')
            ->exists();
        if (! $exists) {
            $db->table('group_permission')->insert([
                'group_id'   => Group::MEMBER_ID,
                'permission' => 'pointSystem.trade',
            ]);
        }
    },
    'down' => function (Builder $schema) {
        $schema->getConnection()
            ->table('group_permission')
            ->where('permission', 'pointSystem.trade')
            ->delete();
    },
];
