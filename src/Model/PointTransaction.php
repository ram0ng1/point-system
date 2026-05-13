<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Model;

use Flarum\Database\AbstractModel;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $user_id
 * @property int $amount
 * @property string $reason
 * @property string|null $reference_type
 * @property int|null $reference_id
 * @property string|null $meta
 * @property \Carbon\Carbon $created_at
 */
class PointTransaction extends AbstractModel
{
    protected $table = 'point_system_transactions';

    public $timestamps = false;

    protected $casts = [
        'amount' => 'integer',
        'reference_id' => 'integer',
        'created_at' => 'datetime',
    ];

    protected $guarded = [];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
