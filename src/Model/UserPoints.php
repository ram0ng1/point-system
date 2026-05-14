<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Model;

use Flarum\Database\AbstractModel;
use Flarum\Foundation\EventGeneratorTrait;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $user_id
 * @property int $balance
 * @property int $lifetime
 * @property int|null $current_avatar_decoration_id
 * @property int|null $current_name_decoration_id
 * @property int|null $current_cover_decoration_id
 * @property int|null $current_title_decoration_id
 * @property int|null $current_post_hl_decoration_id
 * @property \Carbon\Carbon|null $last_daily_bonus_at
 */
class UserPoints extends AbstractModel
{
    use EventGeneratorTrait;

    protected $table = 'point_system_user_points';

    protected $casts = [
        'balance' => 'integer',
        'lifetime' => 'integer',
        'current_avatar_decoration_id' => 'integer',
        'current_name_decoration_id' => 'integer',
        'current_cover_decoration_id' => 'integer',
        'current_title_decoration_id' => 'integer',
        'current_post_hl_decoration_id' => 'integer',
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

    public function coverDecoration(): BelongsTo
    {
        return $this->belongsTo(CoverDecoration::class, 'current_cover_decoration_id');
    }

    public function titleDecoration(): BelongsTo
    {
        return $this->belongsTo(TitleDecoration::class, 'current_title_decoration_id');
    }

    public function postHighlightDecoration(): BelongsTo
    {
        return $this->belongsTo(PostHighlightDecoration::class, 'current_post_hl_decoration_id');
    }
}
