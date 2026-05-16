// @ts-nocheck
import app from 'flarum/admin/app';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';

/**
 * Admin modal: grant a specific shop item directly to a user.
 *
 * Used for hidden frames (is_listed=false) that don't appear in the public
 * shop. Posts to /api/point-system/grant which:
 *   - bypasses price (free gift)
 *   - bypasses is_listed (whole point)
 *   - bypasses availability window / group restriction
 *   - respects max_claims unless ignoreLimit=true
 *
 * Attrs:
 *   - itemType: 'avatar_decoration' | 'name_decoration' | ...
 *   - itemId:   number
 *   - itemLabel: string (for the modal title — e.g. the decoration name)
 *   - onGranted?: () => void  (parent panel callback to refresh its grid)
 */
export default class GrantItemModal extends Modal {
  username = '';
  ignoreLimit = false;
  busy = false;

  className() {
    return 'GrantItemModal Modal--small';
  }

  title() {
    return app.translator.trans('ramon-point-system.admin.grant.title', {
      name: String(this.attrs.itemLabel || ''),
    });
  }

  content() {
    const t = (k: string) => app.translator.trans('ramon-point-system.admin.grant.' + k);

    return (
      <div className="Modal-body">
        <p className="helpText">{t('help')}</p>

        <div className="Form-group">
          <label>{t('username_label')}</label>
          <input
            type="text"
            className="FormControl"
            value={this.username}
            oninput={(e: Event) => (this.username = (e.target as HTMLInputElement).value)}
            placeholder={t('username_placeholder') as string}
            autofocus
          />
          <p className="helpText">{t('username_help')}</p>
        </div>

        <div className="Form-group">
          <label>
            <input type="checkbox" checked={this.ignoreLimit} onchange={(e: Event) => (this.ignoreLimit = (e.target as HTMLInputElement).checked)} />{' '}
            {t('ignore_limit')}
          </label>
          <p className="helpText">{t('ignore_limit_help')}</p>
        </div>

        <div className="Form-group">
          <Button className="Button Button--primary" loading={this.busy} disabled={!this.username.trim() || this.busy} onclick={() => this.submit()}>
            <i className="fas fa-gift" /> {t('submit')}
          </Button>
        </div>
      </div>
    );
  }

  async submit() {
    const username = this.username.trim();
    if (!username) return;
    this.busy = true;
    m.redraw();

    try {
      // Resolve username → id via the standard users JSON:API filter.
      const found = await app.store.find('users', { filter: { q: username }, page: { limit: 5 } });
      const list = Array.isArray(found) ? found : [];
      const match =
        list.find((u: any) => {
          const un = String(u.username?.() ?? '').toLowerCase();
          const dn = String(u.displayName?.() ?? '').toLowerCase();
          const q = username.toLowerCase();
          return un === q || dn === q;
        }) || list[0];
      if (!match) {
        app.alerts.show({ type: 'error' }, app.translator.trans('ramon-point-system.admin.grant.user_not_found'));
        return;
      }

      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
      await app.request({
        method: 'POST',
        url: `${apiUrl}/point-system/grant`,
        body: {
          type: this.attrs.itemType,
          itemId: Number(this.attrs.itemId),
          userId: Number(match.id()),
          ignoreLimit: !!this.ignoreLimit,
        },
      });

      app.alerts.show(
        { type: 'success' },
        app.translator.trans('ramon-point-system.admin.grant.success', {
          name: match.displayName?.() || match.username?.() || '',
          item: String(this.attrs.itemLabel || ''),
        })
      );
      if (this.attrs.onGranted) this.attrs.onGranted();
      this.hide();
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Failed');
    } finally {
      this.busy = false;
      m.redraw();
    }
  }
}
