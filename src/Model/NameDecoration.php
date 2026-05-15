<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Model;

use Flarum\Database\AbstractModel;

/**
 * @property int $id
 * @property string $name
 * @property string $slug
 * @property string|null $description
 * @property string|null $preset
 * @property string|null $custom_css
 * @property int $price
 * @property bool $is_enabled
 * @property int $sort
 */
class NameDecoration extends AbstractModel
{
    protected $table = 'point_system_name_decorations';

    protected $casts = [
        'is_enabled' => 'boolean',
        'price' => 'integer',
        'sort' => 'integer',
    ];

    protected $fillable = ['name', 'slug', 'description', 'preset', 'custom_css', 'price', 'is_enabled', 'sort'];
}
