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
 * Availability columns (max_claims / available_from / available_until /
 * is_listed / allowed_group_ids) follow the same semantics as the decoration
 * tables — see §11 of CLAUDE.md and the 2026_05_16 migration.
 *
 * @property int $id
 * @property int $group_id
 * @property int $points_required
 * @property int $price
 * @property bool $is_auto
 * @property bool $is_purchasable
 * @property bool $is_enabled
 * @property int|null $max_claims
 * @property int $claim_count
 * @property \Carbon\Carbon|null $available_from
 * @property \Carbon\Carbon|null $available_until
 * @property bool $is_listed
 * @property array|null $allowed_group_ids
 */
class GroupOffer extends AbstractModel
{
    protected $table = 'point_system_group_offers';

    protected $casts = [
        'group_id'          => 'integer',
        'points_required'   => 'integer',
        'price'             => 'integer',
        'is_auto'           => 'boolean',
        'is_purchasable'    => 'boolean',
        'is_enabled'        => 'boolean',
        'is_listed'         => 'boolean',
        'max_claims'        => 'integer',
        'claim_count'       => 'integer',
        'available_from'    => 'datetime',
        'available_until'   => 'datetime',
        'allowed_group_ids' => 'array',
    ];

    protected $fillable = [
        'group_id',
        'points_required',
        'price',
        'is_auto',
        'is_purchasable',
        'is_enabled',
        'max_claims', 'claim_count', 'available_from', 'available_until',
        'is_listed', 'allowed_group_ids',
    ];

    public function group(): BelongsTo
    {
        return $this->belongsTo(Group::class);
    }
}
