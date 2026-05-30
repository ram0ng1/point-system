// @ts-nocheck
import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import UsernameAutocomplete from './UsernameAutocomplete';

export default class ManualAwardPanel extends Component {
  username = '';
  amount = 0;
  reason = '';
  busy = false;
  lastResult: any = null;

  bulkAmount = 0;
  bulkReason = '';
  bulkBusy = false;
  bulkResult: any = null;
  bulkConfirm = false;

  view() {
    const t = (k: string) => app.translator.trans('ramon-point-system.admin.manual.' + k);

    return (
      <div className="PointSystemAdmin-section">
        <div className="PointSystemAdmin-section-header">
          <h2>{t('title')}</h2>
          <p className="helpText">{t('help')}</p>
        </div>

        <div className="Form-group">
          <label>{t('field_username')}</label>
          <UsernameAutocomplete
            value={this.username}
            onchange={(v: string) => (this.username = v)}
            placeholder={t('field_username') as string}
          />
        </div>

        <div className="Form-group">
          <label>{t('field_amount')}</label>
          <input
            type="number"
            className="FormControl"
            value={this.amount}
            oninput={(e: Event) => (this.amount = Number((e.target as HTMLInputElement).value))}
          />
          <p className="helpText">{t('field_amount_help')}</p>
        </div>

        <div className="Form-group">
          <label>{t('field_reason')}</label>
          <input className="FormControl" value={this.reason} oninput={(e: Event) => (this.reason = (e.target as HTMLInputElement).value)} />
        </div>

        <div className="Form-group" style="margin-top: 16px;">
          <Button
            className="Button Button--primary"
            loading={this.busy}
            disabled={!this.username.trim() || this.amount === 0}
            onclick={() => this.submit()}
          >
            {t('submit')}
          </Button>
        </div>

        {this.lastResult && (
          <div className="PointSystemAdmin-result">
            <h4>{t('result')}</h4>
            <p><strong>{t('balance')}:</strong> {this.lastResult.balance}</p>
            <p><strong>{t('lifetime')}:</strong> {this.lastResult.lifetime}</p>
          </div>
        )}

        <hr style="margin: 24px 0; border-color: var(--control-bg);" />

        <div className="PointSystemAdmin-section-header">
          <h3>{t('bulk_title')}</h3>
          <p className="helpText">{t('bulk_help')}</p>
        </div>

        <div className="Form-group">
          <label>{t('field_amount')}</label>
          <input
            type="number"
            className="FormControl"
            value={this.bulkAmount}
            oninput={(e: Event) => (this.bulkAmount = Number((e.target as HTMLInputElement).value))}
          />
        </div>

        <div className="Form-group">
          <label>{t('field_reason')}</label>
          <input
            className="FormControl"
            value={this.bulkReason}
            oninput={(e: Event) => (this.bulkReason = (e.target as HTMLInputElement).value)}
          />
        </div>

        {!this.bulkConfirm ? (
          <div className="Form-group" style="margin-top: 16px;">
            <Button
              className="Button Button--danger"
              disabled={this.bulkAmount === 0 || this.bulkBusy}
              onclick={() => { this.bulkConfirm = true; m.redraw(); }}
            >
              <i className="fas fa-users" /> {t('bulk_submit')}
            </Button>
          </div>
        ) : (
          <div className="PointSystemAdmin-bulkConfirm">
            <p><strong>{t('bulk_confirm')}</strong></p>
            <Button
              className="Button Button--danger"
              loading={this.bulkBusy}
              onclick={() => this.submitBulk()}
            >
              <i className="fas fa-check" /> {t('bulk_confirm_yes')}
            </Button>
            {' '}
            <Button
              className="Button"
              disabled={this.bulkBusy}
              onclick={() => { this.bulkConfirm = false; m.redraw(); }}
            >
              {t('bulk_confirm_no')}
            </Button>
          </div>
        )}

        {this.bulkResult && (
          <div className="PointSystemAdmin-result">
            <h4>{t('bulk_result')}</h4>
            <p><strong>{t('bulk_awarded')}:</strong> {this.bulkResult.awarded}</p>
            {this.bulkResult.errors > 0 && (
              <p><strong>{t('bulk_errors')}:</strong> {this.bulkResult.errors}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  async submit() {
    this.busy = true;
    m.redraw();
    try {
      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
      const lookupRes: any = await app.request({
        method: 'GET',
        url: `${apiUrl}/users?filter[q]=${encodeURIComponent(this.username)}&page[limit]=1`,
      });
      const userData = lookupRes?.data?.[0];
      if (!userData) {
        app.alerts.show({ type: 'error' }, app.translator.trans('ramon-point-system.admin.manual.user_not_found'));
        return;
      }
      const userId = Number(userData.id);

      const res: any = await app.request({
        method: 'POST',
        url: `${apiUrl}/point-system/award`,
        body: { userId, amount: this.amount, reason: this.reason || 'admin.adjustment' },
      });
      this.lastResult = res?.data || res;
      app.alerts.show({ type: 'success' }, app.translator.trans('ramon-point-system.admin.manual.success'));
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Failed');
    } finally {
      this.busy = false;
      m.redraw();
    }
  }

  async submitBulk() {
    this.bulkBusy = true;
    m.redraw();
    try {
      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
      const res: any = await app.request({
        method: 'POST',
        url: `${apiUrl}/point-system/bulk-award`,
        body: { amount: this.bulkAmount, reason: this.bulkReason || 'admin.bulk' },
      });
      this.bulkResult = res?.data || res;
      this.bulkConfirm = false;
      app.alerts.show({ type: 'success' }, app.translator.trans('ramon-point-system.admin.manual.bulk_success'));
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Failed');
    } finally {
      this.bulkBusy = false;
      m.redraw();
    }
  }
}
