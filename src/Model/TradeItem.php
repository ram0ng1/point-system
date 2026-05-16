<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Model;

use Flarum\Database\AbstractModel;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $trade_id
 * @property int $owner_id
 * @property string $item_type
 * @property int $item_id
 */
class TradeItem extends AbstractModel
{
    protected $table = 'point_system_trade_items';

    protected $casts = [
        'trade_id' => 'integer',
        'owner_id' => 'integer',
        'item_id'  => 'integer',
    ];

    protected $fillable = ['trade_id', 'owner_id', 'item_type', 'item_id'];

    public function trade(): BelongsTo
    {
        return $this->belongsTo(Trade::class, 'trade_id');
    }
}
