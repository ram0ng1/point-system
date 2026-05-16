// @ts-nocheck
import app from 'flarum/forum/app';
import Notification from 'flarum/forum/components/Notification';

/**
 * Bell-card after a trade commits — fired for BOTH participants. Tapping it
 * takes the user to My Decorations so they can see / equip the newly
 * acquired items.
 */
export default class TradeCompletedNotification extends Notification {
  icon() {
    return 'fas fa-exchange-alt';
  }

  href() {
    try {
      return app.route('pointSystem.decorations');
    } catch {
      return '/';
    }
  }

  content() {
    const fromUser = this.attrs.notification.fromUser?.();
    const name = fromUser?.displayName?.() || app.translator.trans('ramon-point-system.forum.notifications.admin_fallback');
    return app.translator.trans('ramon-point-system.forum.notifications.trade_completed', { name });
  }

  excerpt() {
    return null;
  }
}
