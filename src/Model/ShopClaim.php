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
 * @property int $quantity
 * @property int $price_paid
 * @property \Carbon\Carbon $claimed_at
 */
class ShopClaim extends AbstractModel
{
    public const TYPE_AVATAR  = 'avatar_decoration';
    public const TYPE_NAME    = 'name_decoration';
    public const TYPE_COVER   = 'cover_decoration';
    public const TYPE_TITLE   = 'title_decoration';
    public const TYPE_POST_HL = 'post_highlight_decoration';

    protected $table = 'point_system_claims';

    public $timestamps = false;

    protected $casts = [
        'item_id' => 'integer',
        'quantity' => 'integer',
        'price_paid' => 'integer',
        'claimed_at' => 'datetime',
    ];

    protected $fillable = ['user_id', 'item_type', 'item_id', 'quantity', 'price_paid', 'claimed_at'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
