<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Model;

use Flarum\Database\AbstractModel;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property string $name
 * @property string $slug
 * @property string|null $description
 * @property string $title_text
 * @property string|null $color
 * @property string|null $custom_css
 * @property int $price
 * @property bool $is_enabled
 * @property int $sort
 * @property int|null $max_claims
 * @property int $claim_count
 * @property \Carbon\Carbon|null $available_from
 * @property \Carbon\Carbon|null $available_until
 * @property bool $is_listed
 * @property array|null $allowed_group_ids
 */
class TitleDecoration extends AbstractModel
{
    public const STATUS_APPROVED = 'approved';
    public const STATUS_PENDING  = 'pending';
    public const STATUS_REJECTED = 'rejected';

    protected $table = 'point_system_title_decorations';

    protected $casts = [
        'is_enabled'        => 'boolean',
        'is_listed'         => 'boolean',
        'price'             => 'integer',
        'sort'              => 'integer',
        'max_claims'        => 'integer',
        'claim_count'       => 'integer',
        'available_from'    => 'datetime',
        'available_until'   => 'datetime',
        'allowed_group_ids' => 'array',
        'creator_id'        => 'integer',
    ];

    protected $fillable = [
        'name', 'slug', 'description', 'title_text', 'color', 'custom_css',
        'price', 'is_enabled', 'sort',
        'max_claims', 'claim_count', 'available_from', 'available_until',
        'is_listed', 'allowed_group_ids',
        'creator_id', 'status',
    ];

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'creator_id');
    }
}
