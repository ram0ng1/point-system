<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Model;

use Flarum\Database\AbstractModel;
use Flarum\Group\Group;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $group_id
 * @property int $points_required
 * @property bool $is_enabled
 */
class AutoGroupTier extends AbstractModel
{
    protected $table = 'point_system_auto_group_tiers';

    protected $casts = [
        'group_id' => 'integer',
        'points_required' => 'integer',
        'is_enabled' => 'boolean',
    ];

    protected $guarded = [];

    public function group(): BelongsTo
    {
        return $this->belongsTo(Group::class);
    }
}
