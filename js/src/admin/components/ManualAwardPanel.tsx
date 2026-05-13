// @ts-nocheck
import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';

export default class ManualAwardPanel extends Component {
  username = '';
  amount = 0;
  reason = '';
  busy = false;
  lastResult: any = null;

  view() {
    return (
      <div className="PointSystemAdmin-section">
        <div className="PointSystemAdmin-section-header">
          <h2>{app.translator.trans('ramon-point-system.admin.manual.title')}</h2>
          <p className="helpText">{app.translator.trans('ramon-point-system.admin.manual.help')}</p>
        </div>

        <div className="Form-group">
          <label>{app.translator.trans('ramon-point-system.admin.manual.field_username')}</label>
          <input
            className="FormControl"
            value={this.username}
            oninput={(e: Event) => (this.username = (e.target as HTMLInputElement).value)}
          />
        </div>

        <div className="Form-group">
          <label>{app.translator.trans('ramon-point-system.admin.manual.field_amount')}</label>
          <input
            type="number"
            className="FormControl"
            value={this.amount}
            oninput={(e: Event) => (this.amount = Number((e.target as HTMLInputElement).value))}
          />
          <p className="helpText">{app.translator.trans('ramon-point-system.admin.manual.field_amount_help')}</p>
        </div>

        <div className="Form-group">
          <label>{app.translator.trans('ramon-point-system.admin.manual.field_reason')}</label>
          <input
            className="FormControl"
            value={this.reason}
            oninput={(e: Event) => (this.reason = (e.target as HTMLInputElement).value)}
          />
        </div>

        <Button
          className="Button Button--primary"
          loading={this.busy}
          disabled={!this.username.trim() || this.amount === 0}
          onclick={() => this.submit()}
        >
          {app.translator.trans('ramon-point-system.admin.manual.submit')}
        </Button>

        {this.lastResult && (
          <div className="PointSystemAdmin-result">
            <h4>{app.translator.trans('ramon-point-system.admin.manual.result')}</h4>
            <p>
              <strong>{app.translator.trans('ramon-point-system.admin.manual.balance')}:</strong>{' '}
              {this.lastResult.balance}
            </p>
            <p>
              <strong>{app.translator.trans('ramon-point-system.admin.manual.lifetime')}:</strong>{' '}
              {this.lastResult.lifetime}
            </p>
          </div>
        )}
      </div>
    );
  }

  async submit() {
    this.busy = true;
    m.redraw();
    try {
      // Resolve username → user id via the users API
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
}
