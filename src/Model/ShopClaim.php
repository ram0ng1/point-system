<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Model;

use Flarum\Database\AbstractModel;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $user_id
 * @property string $item_type
 * @property int $item_id
 * @property int $price_paid
 * @property \Carbon\Carbon $claimed_at
 */
class ShopClaim extends AbstractModel
{
    public const TYPE_AVATAR = 'avatar_decoration';
    public const TYPE_NAME   = 'name_decoration';

    protected $table = 'point_system_claims';

    public $timestamps = false;

    protected $casts = [
        'item_id' => 'integer',
        'price_paid' => 'integer',
        'claimed_at' => 'datetime',
    ];

    protected $guarded = [];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
