<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Model;

use Flarum\Database\AbstractModel;
use Flarum\Group\Group;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Unified group-offer row: each entry exposes a group to members through one
 * or both of these unlock paths:
 *  - is_auto: user is auto-attached once their lifetime points reach
 *    `points_required` (free, no balance deduction).
 *  - is_purchasable: user can explicitly buy access by spending `price`
 *    points from their balance, regardless of lifetime totals.
 *
 * Both flags can be on at once. Setting both off effectively hides the offer.
 *
 * @property int $id
 * @property int $group_id
 * @property int $points_required
 * @property int $price
 * @property bool $is_auto
 * @property bool $is_purchasable
 * @property bool $is_enabled
 */
class GroupOffer extends AbstractModel
{
    protected $table = 'point_system_group_offers';

    protected $casts = [
        'group_id'        => 'integer',
        'points_required' => 'integer',
        'price'           => 'integer',
        'is_auto'         => 'boolean',
        'is_purchasable'  => 'boolean',
        'is_enabled'      => 'boolean',
    ];

    protected $fillable = [
        'group_id',
        'points_required',
        'price',
        'is_auto',
        'is_purchasable',
        'is_enabled',
    ];

    public function group(): BelongsTo
    {
        return $this->belongsTo(Group::class);
    }
}
