// @ts-nocheck
import app from 'flarum/forum/app';
import Notification from 'flarum/forum/components/Notification';
import HeaderListItem from 'flarum/forum/components/HeaderListItem';
import Avatar from 'flarum/common/components/Avatar';
import classList from 'flarum/common/utils/classList';
import TradeModal from './TradeModal';

/**
 * Card shown in the bell when the OTHER party of a trade flips their
 * accept flag to `true`. Tells the actor "your turn — open the trade
 * and accept it (or change your offer)".
 *
 * Same plumbing as TradeRequestedNotification: clicking opens the trade
 * modal at the pending trade id instead of navigating to a URL.
 */
export default class TradeAcceptedNotification extends Notification {
  icon() {
    return 'fas fa-check-double';
  }

  href() {
    return '';
  }

  content() {
    const fromUser = this.attrs.notification.fromUser?.();
    const name = fromUser?.displayName?.() || app.translator.trans('ramon-point-system.forum.notifications.admin_fallback');
    return app.translator.trans('ramon-point-system.forum.notifications.trade_accepted', { name });
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
