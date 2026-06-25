<?php

declare(strict_types=1);

use Flarum\Database\Migration;

return Migration::addColumns('point_system_user_points', [
    'current_cover_decoration_id' => ['integer', 'unsigned' => true, 'nullable' => true, 'after' => 'current_name_decoration_id'],
]);
