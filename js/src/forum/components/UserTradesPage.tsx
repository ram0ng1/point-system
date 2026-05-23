// @ts-nocheck
import app from 'flarum/forum/app';
import UserPage from 'flarum/forum/components/UserPage';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import TradeModal from './TradeModal';
import { pointsLabel } from '../../common/utils/pointsLabel';

/**
 * "Trades" tab on the user profile — visible only when the viewer IS the
 * profile owner. The backend's GET /api/point-system/trades already scopes
 * results to the authenticated actor, so a friend opening someone else's
 * profile and forcing the URL `/u/X/trades` still gets THEIR OWN trades
 * back, never X's — making the data leak surface effectively closed
 * regardless of what the frontend renders.
 *
 * That said, we ALSO redirect away on mount when the viewer is not the
 * profile owner so the UI doesn't show a confusingly-empty page or a
 * different user's trade history under someone else's username slug.
 */
export default class UserTradesPage extends UserPage {
  loading = true;
  trades: any[] = [];
  err = '';

  oninit(vnode: any) {
    super.oninit(vnode);
    this.loadUser(m.route.param('username'));
  }

  show(user: any) {
    super.show(user);
    const me = app.session.user;
    if (!me || Number(me.id?.()) !== Number(user.id?.())) {
      // Not the profile owner — bounce them away. Showing the tab
      // publicly would either leak self trades into someone else's
      // profile or render an empty page that confuses the visitor.
      m.route.set(app.route.user(user));
      return;
    }
    this.load();
  }

  async load() {
    this.loading = true;
    m.redraw();
    try {
      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
      const res: any = await app.request({ method: 'GET', url: `${apiUrl}/point-system/trades` });
      this.trades = Array.isArray(res?.data) ? res.data : [];
    } catch (e: any) {
      this.err = e?.response?.errors?.[0]?.detail || 'load_failed';
    } finally {
      this.loading = false;
      m.redraw();
    }
  }

  content() {
    if (this.loading) return <LoadingIndicator />;
    const t = (k: string, v?: any) => app.translator.trans('ramon-point-system.forum.trades_page.' + k, v);

    /*
     * Dedup defensivo por id — mesma justificativa de TradesPage.
     * Veja comentário lá: relato 2026-05-23 sobre "mesma trade aparecer
     * duas vezes na história" sem repro confiável.
     */
    const seen = new Set<number>();
    const tradesUnique = this.trades.filter((tr: any) => {
      const id = Number(tr?.id);
      if (!Number.isFinite(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    const pending = tradesUnique.filter((tr) => tr.status === 'pending');
    const history = tradesUnique.filter((tr) => tr.status !== 'pending');
    const canTrade = app.forum.attribute('pointSystemCanTrade') !== false;

    return (
      <div className="PointSystemTradesPage PointSystemTradesPage--inProfile container">
        <div className="PointSystemTradesPage-header">
          <div className="PointSystemTradesPage-header-titleRow">
            <h1>
              <i className="fas fa-handshake" /> {t('title')}
            </h1>
            {canTrade && (
              <Button
                className="Button Button--primary"
                onclick={() => {
                  const StartTradeModal = require('./StartTradeModal').default;
                  app.modal.show(StartTradeModal);
                }}
              >
                <i className="fas fa-plus" /> {t('start_new')}
              </Button>
            )}
          </div>
          <p className="helpText">{t('subtitle')}</p>
        </div>

        <section className="PointSystemTradesPage-section">
          <h2>{t('pending_heading')}</h2>
          {pending.length === 0 ? (
            <p className="PointSystemTradesPage-empty">{t('pending_empty')}</p>
          ) : (
            <ul className="PointSystemTradesPage-list">{pending.map((tr) => this.renderRow(tr, true))}</ul>
          )}
        </section>

        <section className="PointSystemTradesPage-section">
          <h2>{t('history_heading')}</h2>
          {history.length === 0 ? (
            <p className="PointSystemTradesPage-empty">{t('history_empty')}</p>
          ) : (
            <ul className="PointSystemTradesPage-list">{history.map((tr) => this.renderRow(tr, false))}</ul>
          )}
        </section>
      </div>
    );
  }

  renderRow(trade: any, isPending: boolean) {
    const t = (k: string, v?: any) => app.translator.trans('ramon-point-system.forum.trades_page.' + k, v);
    const youAre = trade.youAre;
    const other = youAre === 'initiator' ? trade.recipient : trade.initiator;
    const yourItems = trade.items.filter(
      (it: any) => Number(it.ownerId) === Number(youAre === 'initiator' ? trade.initiator.id : trade.recipient.id)
    );
    const theirItems = trade.items.filter((it: any) => Number(it.ownerId) === Number(other?.id));
    const yourPoints = youAre === 'initiator' ? trade.initiatorPoints : trade.recipientPoints;
    const theirPoints = youAre === 'initiator' ? trade.recipientPoints : trade.initiatorPoints;
    const accepted = youAre === 'initiator' ? trade.initiatorAccepted : trade.recipientAccepted;
    const theirAccepted = youAre === 'initiator' ? trade.recipientAccepted : trade.initiatorAccepted;

    const statusClass = `is-${trade.status}` + (isPending && accepted && !theirAccepted ? ' is-waiting' : '');

    return (
      <li className={`PointSystemTradesPage-row ${statusClass}`} key={`trade-${trade.id}`}>
        <div className="PointSystemTradesPage-row-party">
          {other?.avatarUrl ? (
            <img className="PointSystemTradesPage-row-avatar" src={other.avatarUrl} alt="" />
          ) : (
            <span className="PointSystemTradesPage-row-avatar PointSystemTradesPage-row-avatar--placeholder" aria-hidden="true">
              <i className="fas fa-user" />
            </span>
          )}
          <div>
            <strong>{other?.displayName || other?.username || '—'}</strong>
            <div className="PointSystemTradesPage-row-time">{this.formatTime(trade.updatedAt)}</div>
          </div>
        </div>
        <div className="PointSystemTradesPage-row-summary">
          <div className="PointSystemTradesPage-row-side">
            <span className="muted">{t('your_side')}</span>
            <span>
              {yourPoints > 0 ? `${Number(yourPoints).toLocaleString()} ${pointsLabel(app)}` : ''}{' '}
              {yourItems.length > 0 ? `+ ${t('items_short', { count: yourItems.length })}` : ''}
              {yourPoints === 0 && yourItems.length === 0 ? <em>—</em> : ''}
            </span>
          </div>
          <i className="fas fa-arrows-alt-h" />
          <div className="PointSystemTradesPage-row-side">
            <span className="muted">{t('their_side')}</span>
            <span>
              {theirPoints > 0 ? `${Number(theirPoints).toLocaleString()} ${pointsLabel(app)}` : ''}{' '}
              {theirItems.length > 0 ? `+ ${t('items_short', { count: theirItems.length })}` : ''}
              {theirPoints === 0 && theirItems.length === 0 ? <em>—</em> : ''}
            </span>
          </div>
        </div>
        <div className="PointSystemTradesPage-row-status">
          <span className={`PointSystemTradesPage-pill ${statusClass}`}>{t('status_' + trade.status)}</span>
          {isPending && (
            <Button className="Button Button--primary" onclick={() => app.modal.show(TradeModal, { tradeId: trade.id })}>
              <i className="fas fa-arrow-right" /> {t('open')}
            </Button>
          )}
        </div>
      </li>
    );
  }

  formatTime(iso?: string | null): string {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return '';
    }
  }
}
