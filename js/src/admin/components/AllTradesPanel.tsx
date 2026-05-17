// @ts-nocheck
import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import AdminTradeDetailModal from './AdminTradeDetailModal';
import { pointsLabel } from '../../common/utils/pointsLabel';

const PAGE_SIZE = 25;

/**
 * Admin "All trades" panel — lists every trade in the system across all
 * users, filterable by status, paginated. Read-only; the admin can see
 * who traded with whom, what they offered, and the outcome.
 *
 * Backed by GET /api/point-system/admin/trades with `?offset=&limit=&status=`.
 */
export default class AllTradesPanel extends Component {
  loading = true;
  trades: any[] = [];
  total = 0;
  offset = 0;
  statusFilter: '' | 'pending' | 'completed' | 'cancelled' = '';

  oninit(vnode: any) {
    super.oninit(vnode);
    this.load();
  }

  async load() {
    this.loading = true;
    m.redraw();
    try {
      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
      const params = new URLSearchParams();
      params.set('offset', String(this.offset));
      params.set('limit', String(PAGE_SIZE));
      if (this.statusFilter) params.set('status', this.statusFilter);
      const res: any = await app.request({
        method: 'GET',
        url: `${apiUrl}/point-system/admin/trades?${params.toString()}`,
      });
      this.trades = Array.isArray(res?.data) ? res.data : [];
      this.total = Number(res?.meta?.total ?? 0);
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Failed to load trades');
      this.trades = [];
    } finally {
      this.loading = false;
      m.redraw();
    }
  }

  view() {
    if (this.loading) return <LoadingIndicator />;
    const t = (k: string, v?: any) => app.translator.trans('ramon-point-system.admin.all_trades.' + k, v);
    const totalPages = Math.max(1, Math.ceil(this.total / PAGE_SIZE));
    const currentPage = Math.floor(this.offset / PAGE_SIZE) + 1;

    return (
      <div className="PointSystemAdmin-section">
        <div className="PointSystemAdmin-section-header">
          <h2>
            <i className="fas fa-handshake" /> {t('title')}
            <span className="PointSystemAdmin-counter">{this.total}</span>
          </h2>
          <p className="helpText">{t('help')}</p>
        </div>

        <div className="PointSystemAdmin-card">
          <div
            className="PointSystemAdmin-card-header"
            style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;"
          >
            <div>
              <h3>{t('list_heading')}</h3>
              <p className="helpText">{t('list_help')}</p>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              <select
                className="FormControl"
                value={this.statusFilter}
                onchange={(e: Event) => {
                  this.statusFilter = (e.target as HTMLSelectElement).value as any;
                  this.offset = 0;
                  this.load();
                }}
              >
                <option value="">{t('filter_all')}</option>
                <option value="pending">{t('filter_pending')}</option>
                <option value="completed">{t('filter_completed')}</option>
                <option value="cancelled">{t('filter_cancelled')}</option>
              </select>
              <Button className="Button" onclick={() => this.load()}>
                <i className="fas fa-sync" /> {t('refresh')}
              </Button>
            </div>
          </div>

          {this.trades.length === 0 ? (
            <p className="PointSystemAdmin-empty">{t('empty')}</p>
          ) : (
            <table className="PointSystemAdmin-table PointSystemAdmin-tradesTable">
              <thead>
                <tr>
                  <th>{t('col_id')}</th>
                  <th>{t('col_initiator')}</th>
                  <th>{t('col_recipient')}</th>
                  <th>{t('col_offer')}</th>
                  <th>{t('col_status')}</th>
                  <th>{t('col_updated')}</th>
                </tr>
              </thead>
              <tbody>{this.trades.map((tr) => this.renderRow(tr, t))}</tbody>
            </table>
          )}

          {totalPages > 1 && (
            <div className="PointSystemAdmin-pagination">
              <Button
                className="Button"
                disabled={this.offset <= 0}
                onclick={() => {
                  this.offset = Math.max(0, this.offset - PAGE_SIZE);
                  this.load();
                }}
              >
                <i className="fas fa-chevron-left" /> {t('prev')}
              </Button>
              <span className="PointSystemAdmin-pageInfo">{t('page_x_of_y', { x: currentPage, y: totalPages })}</span>
              <Button
                className="Button"
                disabled={currentPage >= totalPages}
                onclick={() => {
                  this.offset = this.offset + PAGE_SIZE;
                  this.load();
                }}
              >
                {t('next')} <i className="fas fa-chevron-right" />
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  openDetail(tr: any) {
    app.modal.show(AdminTradeDetailModal, {
      trade: tr,
      onAction: (action: string) => {
        if (action === 'reverted') this.load();
      },
    });
  }

  renderRow(tr: any, t: (k: string, v?: any) => any) {
    const initiatorItems = (tr.items || []).filter((it: any) => Number(it.ownerId) === Number(tr.initiator?.id));
    const recipientItems = (tr.items || []).filter((it: any) => Number(it.ownerId) === Number(tr.recipient?.id));
    return (
      <tr key={`tr-${tr.id}`} className="PointSystemAdmin-tradesTable-row" onclick={() => this.openDetail(tr)} style="cursor: pointer;">
        <td>
          <code>#{tr.id}</code>
        </td>
        <td>
          <div className="PointSystemAdmin-tradeParty">
            {tr.initiator?.avatarUrl && <img src={tr.initiator.avatarUrl} alt="" />}
            <span>
              <strong>{tr.initiator?.displayName || tr.initiator?.username || '—'}</strong>
              <small>@{tr.initiator?.username}</small>
            </span>
          </div>
        </td>
        <td>
          <div className="PointSystemAdmin-tradeParty">
            {tr.recipient?.avatarUrl && <img src={tr.recipient.avatarUrl} alt="" />}
            <span>
              <strong>{tr.recipient?.displayName || tr.recipient?.username || '—'}</strong>
              <small>@{tr.recipient?.username}</small>
            </span>
          </div>
        </td>
        <td className="PointSystemAdmin-tradeOffer">
          <div>
            <span className="muted">{t('initiator_offer')}:</span>{' '}
            {tr.initiatorPoints > 0 ? `${Number(tr.initiatorPoints).toLocaleString()} ${pointsLabel(app)}` : '—'}
            {initiatorItems.length > 0 && (
              <span className="PointSystemAdmin-tag" style="margin-left:6px">
                {t('items_short', { count: initiatorItems.length })}
              </span>
            )}
          </div>
          <div>
            <span className="muted">{t('recipient_offer')}:</span>{' '}
            {tr.recipientPoints > 0 ? `${Number(tr.recipientPoints).toLocaleString()} ${pointsLabel(app)}` : '—'}
            {recipientItems.length > 0 && (
              <span className="PointSystemAdmin-tag" style="margin-left:6px">
                {t('items_short', { count: recipientItems.length })}
              </span>
            )}
          </div>
        </td>
        <td>
          <span className={`PointSystemAdmin-pill is-${tr.status}`}>{t('status_' + tr.status)}</span>
        </td>
        <td>
          <small className="muted">{tr.updatedAt ? new Date(tr.updatedAt).toLocaleString() : '—'}</small>
        </td>
      </tr>
    );
  }
}
