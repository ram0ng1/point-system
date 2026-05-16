<?php

declare(strict_types=1);

namespace Ramon\PointSystem;

use Flarum\Settings\SettingsRepositoryInterface;
use Flarum\User\Exception\PermissionDeniedException;
use Ramon\PointSystem\Model\ShopClaim;

/**
 * Single source of truth for decoration feature toggles AND the trade-
 * subsystem toggle.
 *
 * Each decoration type (avatar / name / cover / title / post-highlight) is
 * paired with an admin-controlled `*_deco_enabled` setting. When the setting
 * is off, both the public catalog (ForumAttributes) AND the API endpoints
 * that mutate that decoration type must refuse the request. The same idea
 * applies to `trade_enabled` for the trade subsystem.
 *
 * Controllers must call `assertEnabled()` / `assertTradeEnabled()` BEFORE
 * any DB write — the gate is the single line that prevents a feature from
 * coming back through a manual API call once the admin has flipped it off.
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

    public const TRADE_SETTING = 'point-system.trade_enabled';

    public const USER_SUBMISSIONS_SETTING = 'point-system.user_submissions_enabled';

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

    /** True when the admin allows trade sessions globally. */
    public function isTradeEnabled(): bool
    {
        return (bool) $this->settings->get(self::TRADE_SETTING, true);
    }

    /**
     * Throw 403 when trading is disabled at admin level. Called by every
     * trade controller — opening, updating, accepting, cancelling.
     * Cancelling-when-disabled stays allowed: a participant should be able
     * to close out a pending trade an admin has just turned off, otherwise
     * the row sits forever.
     */
    public function assertTradeEnabled(): void
    {
        if (! $this->isTradeEnabled()) {
            throw new PermissionDeniedException();
        }
    }

    /**
     * True when admin allows regular users to submit their own decoration
     * designs. Submissions land in `status = pending` and require admin
     * approval before they ship to the public shop. Default OFF — admins
     * have to opt in so no forum gets a flood of user submissions just by
     * installing the extension.
     */
    public function isUserSubmissionsEnabled(): bool
    {
        return (bool) $this->settings->get(self::USER_SUBMISSIONS_SETTING, false);
    }

    public function assertUserSubmissionsEnabled(): void
    {
        if (! $this->isUserSubmissionsEnabled()) {
            throw new PermissionDeniedException();
        }
    }
}
