// @ts-nocheck
import app from 'flarum/forum/app';
import Notification from 'flarum/forum/components/Notification';
import HeaderListItem from 'flarum/forum/components/HeaderListItem';
import Avatar from 'flarum/common/components/Avatar';
import classList from 'flarum/common/utils/classList';
import TradeModal from './TradeModal';

/**
 * Card shown in the bell when another user opens a trade with the actor.
 * Click → open the TradeModal pre-loaded with that trade id, NOT navigate.
 *
 * Bypasses the parent class's view() so we can render HeaderListItem with
 * a null href — the list item renders as `<button>` instead of `<a>`,
 * which fires `onclick` without trying to follow a URL. Returning a fake
 * href (like '#') from `href()` would still let the parent class render
 * a navigable anchor and we'd lose the modal-open behaviour to a route
 * change.
 */
export default class TradeRequestedNotification extends Notification {
  icon() {
    return 'fas fa-handshake';
  }

  // Required abstract methods — overridden view() below ignores href().
  href() {
    return '';
  }

  content() {
    const fromUser = this.attrs.notification.fromUser?.();
    const name = fromUser?.displayName?.() || app.translator.trans('ramon-point-system.forum.notifications.admin_fallback');
    return app.translator.trans('ramon-point-system.forum.notifications.trade_requested', { name });
  }

  excerpt() {
    return null;
  }

  view() {
    const notification = this.attrs.notification;
    const fromUser = notification.fromUser?.();
    const data = notification.content() || {};
    const tradeId = Number(data?.tradeId || 0);

    return (
      <HeaderListItem
        className={classList('Notification', `Notification--${notification.contentType()}`, [!notification.isRead() && 'unread'])}
        avatar={<Avatar user={fromUser || null} />}
        icon={this.icon()}
        content={this.content()}
        excerpt={this.excerpt()}
        datetime={notification.createdAt?.()}
        onclick={(e: Event) => {
          e.preventDefault?.();
          e.stopPropagation?.();
          if (tradeId > 0) {
            app.modal.show(TradeModal, { tradeId });
          }
          this.markAsRead();
        }}
      />
    );
  }
}
