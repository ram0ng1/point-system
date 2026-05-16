// @ts-nocheck
import app from 'flarum/forum/app';
import Notification from 'flarum/forum/components/Notification';

/**
 * Bell-card shown when an admin grants a decoration directly to the user.
 *
 * Blueprint `data` carries `{ itemType, itemId, itemName }`. We resolve the
 * type to a localized copy key so each family reads naturally ("frame" /
 * "name style" / "cover" / "title" / "post highlight").
 */
export default class ItemGrantedNotification extends Notification {
  icon() {
    return 'fas fa-gift';
  }

  href() {
    // Tapping the notification takes the recipient to "My decorations" so
    // they can equip the new item without hunting through the shop.
    try {
      return app.route('pointSystem.decorations');
    } catch {
      return '/';
    }
  }

  content() {
    const data = this.attrs.notification.content() || {};
    const fromUser = this.attrs.notification.fromUser?.();
    const adminName = fromUser?.displayName?.() || app.translator.trans('ramon-point-system.forum.notifications.admin_fallback');

    const typeKey = String(data?.itemType || '').replace(/_decoration$/, '');
    const familyLabel = app.translator.trans(`ramon-point-system.forum.notifications.item_family_${typeKey}`) || typeKey;

    return app.translator.trans('ramon-point-system.forum.notifications.item_granted', {
      admin: adminName,
      family: familyLabel,
      item: String(data?.itemName || ''),
    });
  }

  excerpt() {
    return null;
  }
}
