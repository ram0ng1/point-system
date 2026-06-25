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

    /**
     * Representação JSON:API da claim. Vive no model porque os endpoints de
     * claim e de grant devolvem exatamente o mesmo shape — antes cada um tinha
     * um `serialize()` idêntico (§38.6: lógica compartilhada entre call sites
     * mora no model, não duplicada).
     *
     * @return array{type: string, id: string, attributes: array<string, mixed>}
     */
    public function toApiResource(): array
    {
        return [
            'type' => 'point-system-claims',
            'id' => (string) $this->id,
            'attributes' => [
                'itemType' => $this->item_type,
                'itemId' => $this->item_id,
                'quantity' => (int) $this->quantity,
                'pricePaid' => $this->price_paid,
                'claimedAt' => optional($this->claimed_at)->toIso8601String(),
            ],
        ];
    }
}
