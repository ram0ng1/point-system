<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Model;

use Flarum\Database\AbstractModel;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $user_id
 * @property int $balance
 * @property int $lifetime
 * @property int|null $current_avatar_decoration_id
 * @property int|null $current_name_decoration_id
 * @property \Carbon\Carbon|null $last_daily_bonus_at
 */
class UserPoints extends AbstractModel
{
    protected $table = 'point_system_user_points';

    protected $casts = [
        'balance' => 'integer',
        'lifetime' => 'integer',
        'current_avatar_decoration_id' => 'integer',
        'current_name_decoration_id' => 'integer',
        'last_daily_bonus_at' => 'datetime',
    ];

    protected $guarded = [];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function avatarDecoration(): BelongsTo
    {
        return $this->belongsTo(AvatarDecoration::class, 'current_avatar_decoration_id');
    }

    public function nameDecoration(): BelongsTo
    {
        return $this->belongsTo(NameDecoration::class, 'current_name_decoration_id');
    }
}
