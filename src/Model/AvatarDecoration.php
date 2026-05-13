<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Model;

use Flarum\Database\AbstractModel;

/**
 * @property int $id
 * @property string $name
 * @property string|null $description
 * @property string $image_path
 * @property bool $is_animated
 * @property int $price
 * @property bool $is_enabled
 * @property int $sort
 */
class AvatarDecoration extends AbstractModel
{
    protected $table = 'point_system_avatar_decorations';

    protected $casts = [
        'is_animated' => 'boolean',
        'is_enabled' => 'boolean',
        'price' => 'integer',
        'sort' => 'integer',
    ];

    protected $guarded = [];
}
