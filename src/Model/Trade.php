<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Model;

use Flarum\Database\AbstractModel;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property int $initiator_id
 * @property int $recipient_id
 * @property int $initiator_points
 * @property int $recipient_points
 * @property bool $initiator_accepted
 * @property bool $recipient_accepted
 * @property string $status
 * @property int|null $cancelled_by_id
 * @property \Carbon\Carbon|null $completed_at
 * @property \Carbon\Carbon|null $cancelled_at
 */
class Trade extends AbstractModel
{
    public const STATUS_PENDING   = 'pending';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_CANCELLED = 'cancelled';

    protected $table = 'point_system_trades';

    protected $casts = [
        'initiator_id'        => 'integer',
        'recipient_id'        => 'integer',
        'initiator_points'    => 'integer',
        'recipient_points'    => 'integer',
        'initiator_accepted'  => 'boolean',
        'recipient_accepted'  => 'boolean',
        'cancelled_by_id'     => 'integer',
        'completed_at'        => 'datetime',
        'cancelled_at'        => 'datetime',
    ];

    protected $fillable = [
        'initiator_id', 'recipient_id',
        'initiator_points', 'recipient_points',
        'initiator_accepted', 'recipient_accepted',
        'status', 'cancelled_by_id', 'completed_at', 'cancelled_at',
    ];

    public function initiator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'initiator_id');
    }

    public function recipient(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recipient_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(TradeItem::class, 'trade_id');
    }

    /** True if the given user id is one of the two participants. */
    public function isParticipant(int $userId): bool
    {
        return $userId > 0 && ($userId === (int) $this->initiator_id || $userId === (int) $this->recipient_id);
    }

    /** Whether the trade is still mutable (pending). */
    public function isOpen(): bool
    {
        return $this->status === self::STATUS_PENDING;
    }

    /**
     * Read the accept flag for whichever side the given user is on. Returns
     * false if the user isn't a participant — callers should validate
     * participation before relying on this.
     */
    public function acceptedBy(int $userId): bool
    {
        if ($userId === (int) $this->initiator_id) {
            return (bool) $this->initiator_accepted;
        }
        if ($userId === (int) $this->recipient_id) {
            return (bool) $this->recipient_accepted;
        }
        return false;
    }
}
