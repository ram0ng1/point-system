<?php

declare(strict_types=1);

namespace Ramon\PointSystem;

use Flarum\Foundation\ValidationException;
use Flarum\Settings\SettingsRepositoryInterface;
use Flarum\User\Exception\PermissionDeniedException;
use Ramon\PointSystem\Model\ShopClaim;

/**
 * Single source of truth for decoration feature toggles.
 *
 * Each decoration type (avatar / name / cover / title / post-highlight) is
 * paired with an admin-controlled `*_deco_enabled` setting. When the setting
 * is off, both the public catalog (ForumAttributes) AND the API endpoints
 * that mutate that decoration type must refuse the request. This class
 * provides the small surface that the controllers and resources call to
 * enforce that contract uniformly.
 */
class FeatureGate
{
    /** Map ShopClaim::TYPE_* to the settings key that toggles the feature. */
    public const TYPE_SETTING_MAP = [
        ShopClaim::TYPE_AVATAR  => 'point-system.avatar_deco_enabled',
        ShopClaim::TYPE_NAME    => 'point-system.name_deco_enabled',
        ShopClaim::TYPE_COVER   => 'point-system.cover_deco_enabled',
        ShopClaim::TYPE_TITLE   => 'point-system.title_deco_enabled',
        ShopClaim::TYPE_POST_HL => 'point-system.post_hl_deco_enabled',
    ];

    public function __construct(protected SettingsRepositoryInterface $settings) {}

    public function isEnabled(string $type): bool
    {
        $key = self::TYPE_SETTING_MAP[$type] ?? null;
        if ($key === null) {
            return false;
        }
        return (bool) $this->settings->get($key, true);
    }

    /**
     * Throw 403 when the decoration type is disabled at admin level. Use this
     * before any mutating API action (claim / equip / upload / delete / create).
     */
    public function assertEnabled(string $type): void
    {
        if (! $this->isEnabled($type)) {
            throw new PermissionDeniedException();
        }
    }
}
