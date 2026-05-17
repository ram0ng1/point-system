// @ts-nocheck
import app from 'flarum/admin/app';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import { pointsLabel } from '../../common/utils/pointsLabel';

/**
 * Admin-side modal that opens when clicking a row in the AllTradesPanel.
 * Shows both parties, items each side offered, point amounts, and (for
 * completed trades only) a "Revert trade" button that calls the
 * server-side revert endpoint.
 *
 * The revert is a destructive operation — it flips ShopClaim ownership
 * back and reverses the points movement. We confirm twice (button click +
 * confirm() prompt) before issuing the request.
 *
 * Attrs:
 *   - trade:    the trade row already loaded by AllTradesPanel.
 *   - onAction: (action: 'reverted' | 'closed') => void
 *               Parent panel uses this to refresh the list after a
 *               successful revert.
 */
export default class AdminTradeDetailModal extends Modal {
  static dismissibleOptions = {
    viaEscKey: true,
    viaCloseButton: true,
    viaBackdropClick: true,
  };

  busy = false;
  err = '';
  trade: any = null;

  oninit(vnode: any) {
    super.oninit(vnode);
    this.trade = this.attrs.trade;
  }

  className() {
    return 'AdminTradeDetailModal Modal--large';
  }

  title() {
    const t = (k: string, v?: any) => app.translator.trans('ramon-point-system.admin.trade_detail.' + k, v);
    if (!this.trade) return t('title');
    return t('title_with', { id: this.trade.id });
  }

  content() {
    const t = (k: string, v?: any) => app.translator.trans('ramon-point-system.admin.trade_detail.' + k, v);
    if (!this.trade) {
      return <div className="Modal-body">—</div>;
    }
    const tr = this.trade;
    const initiatorItems = (tr.items || []).filter((it: any) => Number(it.ownerId) === Number(tr.initiator?.id));
    const recipientItems = (tr.items || []).filter((it: any) => Number(it.ownerId) === Number(tr.recipient?.id));
    const canRevert = tr.status === 'completed';

    return (
      <div className="Modal-body AdminTradeDetailModal-body">
        <div className="AdminTradeDetailModal-meta">
          <span>
            <strong>#{tr.id}</strong>
          </span>
          <span className={`PointSystemAdmin-pill is-${tr.status}`}>{t('status_' + tr.status)}</span>
          {tr.updatedAt && (
            <span className="muted">
              {t('updated_at')}: {new Date(tr.updatedAt).toLocaleString()}
            </span>
          )}
          {tr.completedAt && (
            <span className="muted">
              {t('completed_at')}: {new Date(tr.completedAt).toLocaleString()}
            </span>
          )}
          {tr.cancelledAt && (
            <span className="muted">
              {t('cancelled_at')}: {new Date(tr.cancelledAt).toLocaleString()}
            </span>
          )}
        </div>

        <div className="AdminTradeDetailModal-grid">
          {this.renderParty(t('initiator'), tr.initiator, tr.initiatorPoints, initiatorItems, t)}
          <div className="AdminTradeDetailModal-arrow">
            <i className="fas fa-exchange-alt" />
          </div>
          {this.renderParty(t('recipient'), tr.recipient, tr.recipientPoints, recipientItems, t)}
        </div>

        {this.err && (
          <p className="AdminTradeDetailModal-error">
            <i className="fas fa-exclamation-triangle" /> {this.err}
          </p>
        )}

        <div className="AdminTradeDetailModal-footer">
          {canRevert ? (
            <Button className="Button Button--danger" loading={this.busy} disabled={this.busy} onclick={() => this.revert()}>
              <i className="fas fa-undo" /> {t('revert')}
            </Button>
          ) : (
            <p className="helpText AdminTradeDetailModal-revertHelp">
              <i className="fas fa-info-circle" /> {t('revert_not_completed')}
            </p>
          )}
          <Button className="Button" onclick={() => this.hide()}>
            {t('close')}
          </Button>
        </div>
      </div>
    );
  }

  renderParty(label: string, user: any, points: number, items: any[], t: (k: string, v?: any) => any) {
    return (
      <div className="AdminTradeDetailModal-party">
        <span className="AdminTradeDetailModal-party-label">{label}</span>
        <div className="AdminTradeDetailModal-party-user">
          {user?.avatarUrl && <img src={user.avatarUrl} alt="" />}
          <span>
            <strong>{user?.displayName || user?.username || '—'}</strong>
            <small>@{user?.username}</small>
          </span>
        </div>
        <div className="AdminTradeDetailModal-party-offer">
          <div className="AdminTradeDetailModal-party-points">
            <i className="fas fa-coins" /> {Number(points || 0).toLocaleString()} {pointsLabel(app)}
          </div>
          {items.length === 0 ? (
            <p className="muted">{t('no_items')}</p>
          ) : (
            <ul className="AdminTradeDetailModal-itemList">
              {items.map((it: any) => (
                <li key={`it-${it.id}`}>
                  <span className="AdminTradeDetailModal-itemType">{this.familyLabel(it.itemType, t)}</span>
                  <code>#{it.itemId}</code>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  familyLabel(type: string, t: (k: string, v?: any) => any): string {
    const map: Record<string, string> = {
      avatar_decoration: t('family_avatar'),
      name_decoration: t('family_name'),
      cover_decoration: t('family_cover'),
      title_decoration: t('family_title'),
      post_highlight_decoration: t('family_post_hl'),
    };
    return map[type] || type;
  }

  async revert() {
    if (!this.trade || this.trade.status !== 'completed') return;
    const t = (k: string) => app.translator.trans('ramon-point-system.admin.trade_detail.' + k);
    if (!confirm(t('confirm_revert') as string)) return;
    this.busy = true;
    this.err = '';
    m.redraw();
    try {
      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
      const res: any = await app.request({
        method: 'POST',
        url: `${apiUrl}/point-system/admin/trades/${this.trade.id}/revert`,
      });
      this.trade = res?.data ?? this.trade;
      app.alerts.show({ type: 'success' }, t('reverted_alert'));
      if (this.attrs.onAction) this.attrs.onAction('reverted');
      this.hide();
    } catch (e: any) {
      const code = e?.response?.errors?.[0]?.code;
      const detail = e?.response?.errors?.[0]?.detail;
      // The repo returns `item_re_traded` when the items have moved on
      // since the original completion. Surface that as a localized
      // explanation rather than the raw JSON-encoded validator payload.
      if (typeof detail === 'string' && detail.includes('item_re_traded')) {
        this.err = t('error_item_re_traded') as string;
      } else if (code) {
        this.err = String(code);
      } else {
        this.err = (t('error_revert') as string) || 'Revert failed';
      }
    } finally {
      this.busy = false;
      m.redraw();
    }
  }
}
