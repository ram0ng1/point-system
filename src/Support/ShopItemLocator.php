<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Support;

use Illuminate\Database\Eloquent\Model;
use Ramon\PointSystem\Model\AvatarDecoration;
use Ramon\PointSystem\Model\CoverDecoration;
use Ramon\PointSystem\Model\NameDecoration;
use Ramon\PointSystem\Model\PostHighlightDecoration;
use Ramon\PointSystem\Model\ShopClaim;
use Ramon\PointSystem\Model\TitleDecoration;

/**
 * Resolves a shop item's concrete decoration model from its `(item_type, id)`
 * pair. Shared by the claim and grant controllers so the type→model mapping
 * lives in exactly one place (CLAUDE.md §38.6).
 */
final class ShopItemLocator
{
    /**
     * Find and row-lock the decoration by type+id. Returns null when the row
     * doesn't exist — callers translate that into a 404. The `lockForUpdate`
     * only takes effect inside an open transaction.
     */
    public static function lock(string $type, int $id): ?Model
    {
        $query = match ($type) {
            ShopClaim::TYPE_AVATAR  => AvatarDecoration::query(),
            ShopClaim::TYPE_COVER   => CoverDecoration::query(),
            ShopClaim::TYPE_TITLE   => TitleDecoration::query(),
            ShopClaim::TYPE_POST_HL => PostHighlightDecoration::query(),
            default                 => NameDecoration::query(),
        };

        return $query->where('id', $id)->lockForUpdate()->first();
    }
}
