// @ts-nocheck
import app from 'flarum/forum/app';
import Notification from 'flarum/forum/components/Notification';

/**
 * Notification card shown when the user joins a tier group (either via the
 * manual Claim button on the Rewards page or by auto-promotion after a
 * points award). Blueprint subject is the Group, and `getData()` carries the
 * group label and the points threshold.
 */
export default class TierClaimedNotification extends Notification {
  icon() {
    const data = this.attrs.notification.content() || {};
    return data?.groupIcon || 'fas fa-layer-group';
  }

  href() {
    try {
      return app.route('pointSystem.shop') + '?tab=tiers';
    } catch {
      return '/';
    }
  }

  content() {
    const data = this.attrs.notification.content() || {};
    const name = data?.groupName || '—';
    return app.translator.trans('ramon-point-system.forum.notifications.tier_claimed', { name });
  }

  excerpt() {
    const data = this.attrs.notification.content() || {};
    const pts = Number(data?.pointsRequired || 0);
    return pts > 0
      ? app.translator.trans('ramon-point-system.forum.notifications.tier_excerpt', {
          points: pts.toLocaleString(),
        })
      : null;
  }
}
