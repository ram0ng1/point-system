<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Api\Resource;

use Flarum\Api\Context;
use Flarum\Api\Schema;

/**
 * Provides the shared availability-field set that every shop-item resource
 * appends to its fields() return. Centralised so the JSON:API surface stays
 * consistent across families and so a future audit can grep one helper
 * instead of five identical Schema blocks.
 */
final class AvailabilityFields
{
    /**
     * @return array<int, mixed>
     */
    public static function fields(): array
    {
        $managerOnly = function ($_model, Context $context) {
            return (bool) $context->getActor()->hasPermission('pointSystem.manage');
        };

        return [
            // Public — needed by the shop UI to render the "X left" / "Until"
            // / "Sold out" badges. Frontend trusts the server scope to have
            // hidden out-of-window items already; these are display-only.
            Schema\Integer::make('maxClaims')->property('max_claims')->nullable()
                ->writable($managerOnly),

            Schema\Integer::make('claimCount')->property('claim_count')
                ->writable($managerOnly),

            Schema\DateTime::make('availableFrom')->property('available_from')->nullable()
                ->writable($managerOnly),

            Schema\DateTime::make('availableUntil')->property('available_until')->nullable()
                ->writable($managerOnly),

            // is_listed is admin-controlled; non-managers can READ it but the
            // shop scope() already filters unlisted rows out, so they only
            // ever see is_listed=true here. We expose it so the manager UI
            // shows the current state on the admin panel grid.
            Schema\Boolean::make('isListed')->property('is_listed')
                ->writable($managerOnly),

            Schema\Arr::make('allowedGroupIds')->property('allowed_group_ids')->nullable()
                ->writable($managerOnly),
        ];
    }
}
