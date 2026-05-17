// @ts-nocheck
import app from 'flarum/admin/app';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import AvailabilityInputs from './AvailabilityInputs';
import { pointsLabel } from '../../common/utils/pointsLabel';

const EMPTY_AVAILABILITY = () => ({
  maxClaims: null,
  claimCount: 0,
  availableFrom: '',
  availableUntil: '',
  isListed: true,
  allowedGroupIds: [],
});

export default class CreateTitleDecorationModal extends Modal {
  static dismissibleOptions = {
    viaEscKey: true,
    viaCloseButton: true,
    viaBackdropClick: false,
  };

  draft: any = {
    name: '',
    titleText: '',
    description: '',
    color: '#6cc04a',
    price: 100,
    customCss: '',
    availability: EMPTY_AVAILABILITY(),
  };
  saving = false;

  className() {
    return 'EditDecorationModal CreateDecorationModal Modal--medium';
  }

  title() {
    return app.translator.trans('ramon-point-system.admin.title.create_title');
  }

  content() {
    const draft = this.draft;
    const t = (k: string) => app.translator.trans('ramon-point-system.admin.title.' + k);

    return (
      <div className="Modal-body">
        <div className="PointSystemAdmin-preview">
          <span className="ps-title-preview" style={draft.color ? `--ps-title-color:${draft.color}` : null}>
            {draft.titleText || '—'}
          </span>
        </div>

        <div className="Form-group">
          <label>{t('field_name')}</label>
          <input className="FormControl" value={draft.name} oninput={(e: Event) => (draft.name = (e.target as HTMLInputElement).value)} autofocus />
        </div>

        <div className="Form-group">
          <label>{t('field_title_text')}</label>
          <input
            className="FormControl"
            maxlength="60"
            value={draft.titleText}
            oninput={(e: Event) => (draft.titleText = (e.target as HTMLInputElement).value)}
          />
          <p className="helpText">{t('field_title_text_help')}</p>
        </div>

        <div className="Form-group">
          <label>{t('field_color')}</label>
          <input className="FormControl" value={draft.color} oninput={(e: Event) => (draft.color = (e.target as HTMLInputElement).value)} />
          <p className="helpText">{t('field_color_help')}</p>
        </div>

        <div className="Form-group">
          <label>
            {t('field_price')} ({pointsLabel(app)})
          </label>
          <input
            type="number"
            min="0"
            className="FormControl"
            value={draft.price}
            oninput={(e: Event) => (draft.price = Number((e.target as HTMLInputElement).value))}
          />
        </div>

        <div className="Form-group">
          <label>{t('field_description')}</label>
          <input
            className="FormControl"
            value={draft.description}
            oninput={(e: Event) => (draft.description = (e.target as HTMLInputElement).value)}
          />
        </div>

        <div className="Form-group">
          <label>{t('field_css')}</label>
          <textarea
            className="FormControl PointSystemAdmin-css"
            rows={4}
            placeholder="font-weight: 700; text-transform: uppercase;"
            value={draft.customCss}
            oninput={(e: Event) => (draft.customCss = (e.target as HTMLTextAreaElement).value)}
          />
          <p className="helpText">{t('field_css_help')}</p>
        </div>

        <AvailabilityInputs state={draft.availability} onchange={(s: any) => (draft.availability = s)} />

        <div className="Form-group EditDecorationModal-actions">
          <Button
            className="Button Button--primary"
            loading={this.saving}
            disabled={this.saving || !draft.name.trim() || !draft.titleText.trim()}
            onclick={() => this.commit()}
          >
            <i className="fas fa-plus" /> {t('create')}
          </Button>
          <Button className="Button" disabled={this.saving} onclick={() => this.hide()}>
            {app.translator.trans('ramon-point-system.admin.cancel')}
          </Button>
        </div>
      </div>
    );
  }

  async commit() {
    const draft = this.draft;
    if (!draft.name.trim() || !draft.titleText.trim()) return;
    this.saving = true;
    m.redraw();
    try {
      const av = draft.availability || EMPTY_AVAILABILITY();
      await app.store.createRecord('point-system-title-decorations').save({
        name: draft.name.trim(),
        titleText: draft.titleText.trim(),
        description: draft.description || null,
        color: draft.color || null,
        customCss: draft.customCss || null,
        price: Number(draft.price) || 0,
        isEnabled: true,
        maxClaims: av.maxClaims,
        availableFrom: av.availableFrom || null,
        availableUntil: av.availableUntil || null,
        isListed: !!av.isListed,
        allowedGroupIds: Array.isArray(av.allowedGroupIds) ? av.allowedGroupIds : [],
      });
      if (this.attrs.onCreated) this.attrs.onCreated();
      app.alerts.show({ type: 'success' }, app.translator.trans('ramon-point-system.admin.title.created'));
      this.hide();
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Error');
    } finally {
      this.saving = false;
      m.redraw();
    }
  }
}
