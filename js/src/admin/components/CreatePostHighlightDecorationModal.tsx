// @ts-nocheck
import app from 'flarum/admin/app';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import AvailabilityInputs from './AvailabilityInputs';
import { pointsLabel } from '../../common/utils/pointsLabel';

const BUILTIN_PRESETS = [
  'gold-border',
  'silver-border',
  'glow-blue',
  'glow-purple',
  'glow-green',
  'ribbon-red',
  'ribbon-gold',
  'dashed-accent',
  'gradient-edge',
  'shadow-soft',
];

const EMPTY_AVAILABILITY = () => ({
  maxClaims: null,
  claimCount: 0,
  availableFrom: '',
  availableUntil: '',
  isListed: true,
  allowedGroupIds: [],
});

export default class CreatePostHighlightDecorationModal extends Modal {
  static dismissibleOptions = {
    viaEscKey: true,
    viaCloseButton: true,
    viaBackdropClick: false,
  };

  draft: any = {
    name: '',
    description: '',
    preset: 'gold-border',
    price: 150,
    customCss: '',
    availability: EMPTY_AVAILABILITY(),
  };
  saving = false;

  className() {
    return 'EditDecorationModal CreateDecorationModal Modal--medium';
  }

  title() {
    return app.translator.trans('ramon-point-system.admin.post_hl.create_title');
  }

  content() {
    const draft = this.draft;
    const safePreset = String(draft.preset || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const presetCls = safePreset && safePreset !== 'custom' ? `ps-posthl-${safePreset}` : '';
    const t = (k: string) => app.translator.trans('ramon-point-system.admin.post_hl.' + k);

    return (
      <div className="Modal-body">
        <div className="PointSystemAdmin-preview">
          <div className={`ps-posthl-preview ${presetCls}`}>
            <div className="ps-posthl-preview-avatar" />
            <div className="ps-posthl-preview-body">
              <div className="ps-posthl-preview-line" />
              <div className="ps-posthl-preview-line short" />
            </div>
          </div>
        </div>

        <div className="Form-group">
          <label>{t('field_name')}</label>
          <input className="FormControl" value={draft.name} oninput={(e: Event) => (draft.name = (e.target as HTMLInputElement).value)} autofocus />
        </div>

        <div className="Form-group">
          <label>{t('field_preset')}</label>
          <select className="FormControl" value={draft.preset} onchange={(e: Event) => (draft.preset = (e.target as HTMLSelectElement).value)}>
            {BUILTIN_PRESETS.map((p) => (
              <option value={p}>{app.translator.trans(`ramon-point-system.admin.post_hl.preset_${p}`)}</option>
            ))}
            <option value="custom">{t('preset_custom')}</option>
          </select>
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
            placeholder="& { outline: 2px solid gold; outline-offset: 4px; }"
            value={draft.customCss}
            oninput={(e: Event) => (draft.customCss = (e.target as HTMLTextAreaElement).value)}
          />
          <p className="helpText">{t('field_css_help')}</p>
        </div>

        <AvailabilityInputs state={draft.availability} onchange={(s: any) => (draft.availability = s)} />

        <div className="Form-group EditDecorationModal-actions">
          <Button className="Button Button--primary" loading={this.saving} disabled={this.saving || !draft.name.trim()} onclick={() => this.commit()}>
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
    if (!draft.name.trim()) return;
    this.saving = true;
    m.redraw();
    try {
      const av = draft.availability || EMPTY_AVAILABILITY();
      await app.store.createRecord('point-system-post-highlight-decorations').save({
        name: draft.name.trim(),
        description: draft.description || null,
        preset: draft.preset,
        customCss: draft.preset === 'custom' ? draft.customCss : null,
        price: Number(draft.price) || 0,
        isEnabled: true,
        maxClaims: av.maxClaims,
        availableFrom: av.availableFrom || null,
        availableUntil: av.availableUntil || null,
        isListed: !!av.isListed,
        allowedGroupIds: Array.isArray(av.allowedGroupIds) ? av.allowedGroupIds : [],
      });
      if (this.attrs.onCreated) this.attrs.onCreated();
      app.alerts.show({ type: 'success' }, app.translator.trans('ramon-point-system.admin.post_hl.created'));
      this.hide();
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Error');
    } finally {
      this.saving = false;
      m.redraw();
    }
  }
}
