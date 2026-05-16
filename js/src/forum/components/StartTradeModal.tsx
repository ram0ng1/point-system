// @ts-nocheck
import app from 'flarum/forum/app';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import TradeModal from './TradeModal';

/**
 * Small picker modal opened from the TradesPage. Lets the actor type a
 * username and resolves it via Flarum's standard users JSON:API filter,
 * then hands off to the full TradeModal.
 *
 * This is the canonical "new trade" entry point on the trades dashboard —
 * the per-profile "Trocar" button in UserControls is still there for
 * starting a trade directly from someone's profile, but this gives users
 * who already navigated to /trades a way to open a session without first
 * hunting down the counterparty's profile.
 */
export default class StartTradeModal extends Modal {
  username = '';
  busy = false;
  err = '';

  className() {
    return 'PointSystemStartTradeModal Modal--small';
  }

  title() {
    return app.translator.trans('ramon-point-system.forum.trades_page.start_title');
  }

  content() {
    const t = (k: string) => app.translator.trans('ramon-point-system.forum.trades_page.' + k);

    return (
      <div className="Modal-body">
        <p className="helpText">{t('start_help')}</p>

        <div className="Form-group">
          <label>{t('start_username_label')}</label>
          <input
            type="text"
            className="FormControl"
            value={this.username}
            oninput={(e: Event) => (this.username = (e.target as HTMLInputElement).value)}
            placeholder={t('start_username_placeholder') as string}
            autofocus
            onkeydown={(e: KeyboardEvent) => {
              if (e.key === 'Enter') this.submit();
            }}
          />
        </div>

        {this.err && (
          <p className="PointSystemStartTradeModal-error">
            <i className="fas fa-exclamation-triangle" /> {this.err}
          </p>
        )}

        <div className="Form-group" style="display:flex; justify-content:flex-end; gap:8px;">
          <Button className="Button" onclick={() => this.hide()}>
            {app.translator.trans('core.lib.confirm_password.dismiss_button')}
          </Button>
          <Button
            className="Button Button--primary"
            loading={this.busy}
            disabled={!this.username.trim() || this.busy}
            onclick={() => this.submit()}
          >
            <i className="fas fa-handshake" /> {t('start_submit')}
          </Button>
        </div>
      </div>
    );
  }

  async submit() {
    const username = this.username.trim();
    if (!username) return;

    this.busy = true;
    this.err = '';
    m.redraw();

    try {
      const found = await app.store.find('users', { filter: { q: username }, page: { limit: 5 } });
      const list = Array.isArray(found) ? found : [];
      const match = list.find((u: any) => {
        const un = String(u.username?.() ?? '').toLowerCase();
        const dn = String(u.displayName?.() ?? '').toLowerCase();
        const q = username.toLowerCase();
        return un === q || dn === q;
      }) || list[0];

      if (!match) {
        this.err = app.translator.trans('ramon-point-system.forum.trades_page.start_not_found') as string;
        return;
      }

      const me = app.session.user;
      if (me && Number(me.id?.()) === Number(match.id?.())) {
        this.err = app.translator.trans('ramon-point-system.forum.trade.error_cannot_trade_with_self') as string;
        return;
      }

      // Hand off to the full trade modal. We hide() first so the picker
      // doesn't stack under the trade modal in the modal manager.
      this.hide();
      app.modal.show(TradeModal, { target: match });
    } catch (e: any) {
      this.err = e?.response?.errors?.[0]?.detail || 'Failed';
    } finally {
      this.busy = false;
      m.redraw();
    }
  }
}
