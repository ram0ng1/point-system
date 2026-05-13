// @ts-nocheck
import app from 'flarum/forum/app';
import Notification from 'flarum/forum/components/Notification';

/**
 * Notification card shown when an admin manually adjusts the user's points.
 * Reads the signed `amount` and optional `reason` out of the blueprint data
 * and renders different copy for add vs. remove.
 */
export default class PointsManualNotification extends Notification {
  icon() {
    const data = this.attrs.notification.content() || {};
    const amount = Number(data?.amount ?? 0);
    return amount >= 0 ? 'fas fa-coins' : 'fas fa-minus-circle';
  }

  href() {
    // Tapping the notification takes the user to the Rewards page so they
    // see the updated balance in context.
    try {
      return app.route('pointSystem.shop');
    } catch {
      return '/';
    }
  }

  content() {
    const data = this.attrs.notification.content() || {};
    const amount = Number(data?.amount ?? 0);
    const abs = Math.abs(amount).toLocaleString();
    const fromUser = this.attrs.notification.fromUser?.();
    const adminName = fromUser?.displayName?.() || app.translator.trans('ramon-point-system.forum.notifications.admin_fallback');
    const key = amount >= 0
      ? 'ramon-point-system.forum.notifications.points_added'
      : 'ramon-point-system.forum.notifications.points_removed';
    return app.translator.trans(key, { admin: adminName, amount: abs });
  }

  excerpt() {
    const data = this.attrs.notification.content() || {};
    return data?.reason && data.reason !== 'admin.adjustment' ? String(data.reason) : null;
  }
}
