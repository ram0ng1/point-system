// @ts-nocheck
import app from 'flarum/forum/app';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';

/**
 * Modal for managing (adding OR removing) a user's points. Opened from the
 * user-profile Controls dropdown. Two explicit buttons keep the intent clear:
 *   - "Adicionar" credits balance + lifetime
 *   - "Remover" debits balance only (lifetime is preserved)
 * Both hit the existing `/api/point-system/award` endpoint, which interprets
 * sign of the amount and enforces `pointSystem.manage` server-side.
 */
export default class AwardPointsModal extends Modal {
  amount = 0;
  reason = '';
  // Track which button is mid-request so only it spins, not both.
  busy: 'add' | 'remove' | null = null;

  className() {
    return 'AwardPointsModal Modal--small';
  }

  title() {
    return app.translator.trans('ramon-point-system.forum.award_modal.title', {
      name: this.attrs.user.displayName(),
    });
  }

  content() {
    const t = (k: string) => app.translator.trans('ramon-point-system.forum.award_modal.' + k);
    const balance = Number(this.attrs.user.attribute('pointBalance') ?? 0);
    const lifetime = Number(this.attrs.user.attribute('pointLifetime') ?? 0);

    return (
      <div className="Modal-body">
        <div className="AwardPointsModal-current">
          <span>
            {t('current_balance')}: <strong>{balance.toLocaleString()}</strong>
          </span>
          <span>
            {t('current_lifetime')}: <strong>{lifetime.toLocaleString()}</strong>
          </span>
        </div>

        <div className="Form-group">
          <label>{t('amount_label')}</label>
          <input
            type="number"
            className="FormControl"
            min="1"
            step="1"
            value={this.amount}
            oninput={(e: Event) => (this.amount = Math.max(0, Number((e.target as HTMLInputElement).value)))}
            autofocus
          />
          <p className="helpText">{t('amount_help')}</p>
        </div>

        <div className="Form-group">
          <label>{t('reason_label')}</label>
          <input
            type="text"
            className="FormControl"
            value={this.reason}
            oninput={(e: Event) => (this.reason = (e.target as HTMLInputElement).value)}
            placeholder={t('reason_placeholder') as string}
          />
        </div>

        <div className="Form-group AwardPointsModal-actions">
          <Button
            className="Button Button--primary"
            loading={this.busy === 'add'}
            disabled={!this.amount || this.busy !== null}
            onclick={() => this.submit('add')}
          >
            <i className="fas fa-plus" /> {t('add')}
          </Button>
          <Button
            className="Button Button--danger"
            loading={this.busy === 'remove'}
            disabled={!this.amount || this.busy !== null}
            onclick={() => this.submit('remove')}
          >
            <i className="fas fa-minus" /> {t('remove')}
          </Button>
        </div>
      </div>
    );
  }

  async submit(direction: 'add' | 'remove') {
    if (!this.amount) return;
    this.busy = direction;
    m.redraw();

    const signed = direction === 'add' ? Number(this.amount) : -Number(this.amount);

    try {
      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
      const res: any = await app.request({
        method: 'POST',
        url: `${apiUrl}/point-system/award`,
        body: {
          userId: Number(this.attrs.user.id()),
          amount: signed,
          reason: this.reason || 'admin.adjustment',
        },
      });

      const data = res?.data || res;
      if (data?.balance !== undefined) {
        this.attrs.user.pushAttributes({
          pointBalance: Number(data.balance),
          pointLifetime: Number(data.lifetime),
        });
      }

      app.alerts.show(
        { type: 'success' },
        app.translator.trans(
          direction === 'add'
            ? 'ramon-point-system.forum.award_modal.added'
            : 'ramon-point-system.forum.award_modal.removed',
          { name: this.attrs.user.displayName(), amount: Number(this.amount).toLocaleString() },
        ),
      );
      this.hide();
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Failed');
    } finally {
      this.busy = null;
      m.redraw();
    }
  }
}
