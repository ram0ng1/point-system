// @ts-nocheck
import app from 'flarum/forum/app';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';

/**
 * Pre-purchase confirmation. Spending points is irreversible — the previous
 * one-click claim made it easy to mis-spend, especially on mobile. This modal
 * surfaces the item preview, the price, and the resulting balance so the user
 * can back out before committing.
 *
 * Attrs:
 *   - title:     header copy (e.g. "Confirm purchase")
 *   - itemName:  what's being bought ("Golden Crown")
 *   - itemPrice: cost in points
 *   - currentBalance: user's current balance
 *   - currencyIcon:   FA icon class for the points pill
 *   - preview:   optional Mithril vnode rendered above the body (decoration
 *                preview, cover thumbnail, tier badge, etc.)
 *   - confirmLabel: optional override for the primary button copy
 *   - onConfirm: async fn called when the user confirms; receives the modal
 *                instance so it can close itself after success/failure.
 */
export default class ConfirmPurchaseModal extends Modal {
  busy = false;

  className() {
    return 'ConfirmPurchaseModal Modal--small';
  }

  title() {
    return this.attrs.title || app.translator.trans('ramon-point-system.forum.confirm.title');
  }

  content() {
    const t = (k: string, vars?: any) =>
      app.translator.trans('ramon-point-system.forum.confirm.' + k, vars);
    const price = Number(this.attrs.itemPrice ?? 0);
    const balance = Number(this.attrs.currentBalance ?? 0);
    const after = Math.max(0, balance - price);
    const icon =
      this.attrs.currencyIcon ||
      (app.forum.attribute('pointSystem.currency_icon') as string) ||
      'fas fa-coins';

    return (
      <div className="Modal-body ConfirmPurchaseModal-body">
        {this.attrs.preview && (
          <div className="ConfirmPurchaseModal-preview">{this.attrs.preview}</div>
        )}

        <div className="ConfirmPurchaseModal-item">
          <strong>{this.attrs.itemName || '—'}</strong>
        </div>

        <dl className="ConfirmPurchaseModal-ledger">
          <div>
            <dt>{t('price')}</dt>
            <dd>
              <i className={icon} aria-hidden="true" /> {price.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt>{t('current_balance')}</dt>
            <dd>
              <i className={icon} aria-hidden="true" /> {balance.toLocaleString()}
            </dd>
          </div>
          <div className="ConfirmPurchaseModal-ledger-after">
            <dt>{t('after_purchase')}</dt>
            <dd>
              <i className={icon} aria-hidden="true" /> <strong>{after.toLocaleString()}</strong>
            </dd>
          </div>
        </dl>

        <div className="Form-group ConfirmPurchaseModal-actions">
          <Button
            className="Button"
            disabled={this.busy}
            onclick={() => this.hide()}
          >
            {t('cancel')}
          </Button>
          <Button
            className="Button Button--primary"
            loading={this.busy}
            disabled={price > balance}
            onclick={() => this.submit()}
          >
            {this.attrs.confirmLabel || t('confirm')}
          </Button>
        </div>
      </div>
    );
  }

  async submit() {
    if (this.busy || typeof this.attrs.onConfirm !== 'function') return;
    this.busy = true;
    m.redraw();
    try {
      await this.attrs.onConfirm();
      this.hide();
    } catch (e) {
      // Caller surfaces its own alert — we just stop spinning.
    } finally {
      this.busy = false;
      m.redraw();
    }
  }
}
