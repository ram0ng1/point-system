// @ts-nocheck
import app from 'flarum/admin/app';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import AvailabilityInputs from './AvailabilityInputs';
import { pointsLabel } from '../../common/utils/pointsLabel';

const BUILTIN_PRESETS = [
  'gold',
  'gold-pulse',
  'rainbow',
  'neon',
  'fire',
  'ice',
  'glitch',
  'shine',
  'galaxy',
  'breath',
  'royal',
  'matrix',
  'typer',
  'mercury',
  'huecycle',
  'blur',
  'lightning',
  'underline',
  'toxic',
  'vhs',
  'glass',
  'stamp',
  'hearts',
  'sparkle',
  'wave',
];

const EMPTY_AVAILABILITY = () => ({
  maxClaims: null,
  claimCount: 0,
  availableFrom: '',
  availableUntil: '',
  isListed: true,
  allowedGroupIds: [],
});

/**
 * Create modal for a new name decoration. Same fields as the old inline
 * create form; moved into a modal so the panel surface is dedicated to the
 * list of existing items.
 *
 * Attrs:
 *   - onCreated?: () => void   refresh callback for the parent panel
 */
export default class CreateNameDecorationModal extends Modal {
  static dismissibleOptions = {
    viaEscKey: true,
    viaCloseButton: true,
    viaBackdropClick: false,
  };

  draft: any = {
    name: '',
    description: '',
    preset: 'fire',
    price: 50,
    customCss: '',
    availability: EMPTY_AVAILABILITY(),
  };
  saving = false;

  className() {
    return 'EditDecorationModal CreateDecorationModal Modal--medium';
  }

  title() {
    return app.translator.trans('ramon-point-system.admin.name.create_title');
  }

  content() {
    const draft = this.draft;
    const previewStyle = draft.preset === 'custom' && !String(draft.customCss).includes('{') ? this.parseInlineCss(draft.customCss) : null;
    const t = (k: string) => app.translator.trans('ramon-point-system.admin.name.' + k);

    return (
      <div className="Modal-body">
        <div className="PointSystemAdmin-preview">
          <span>{t('preview')}:</span>
          <span className={`ps-name-preview ps-name-${draft.preset === 'custom' ? '__livecustom' : draft.preset}`} style={previewStyle}>
            Username
          </span>
        </div>

        <div className="Form-group">
          <label>{t('field_name')}</label>
          <input className="FormControl" value={draft.name} oninput={(e: Event) => (draft.name = (e.target as HTMLInputElement).value)} autofocus />
        </div>

        <div className="Form-group">
          <label>{t('field_preset')}</label>
          <select className="FormControl" value={draft.preset} onchange={(e: Event) => (draft.preset = (e.target as HTMLSelectElement).value)}>
            {BUILTIN_PRESETS.map((p) => (
              <option value={p}>{app.translator.trans(`ramon-point-system.admin.name.preset_${p}`)}</option>
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
            rows={5}
            placeholder="color: gold; text-shadow: 0 0 6px gold;"
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
      await app.store.createRecord('point-system-name-decorations').save({
        name: draft.name,
        description: draft.description || null,
        preset: draft.preset,
        price: draft.price,
        customCss: draft.customCss || null,
        maxClaims: av.maxClaims,
        availableFrom: av.availableFrom || null,
        availableUntil: av.availableUntil || null,
        isListed: !!av.isListed,
        allowedGroupIds: Array.isArray(av.allowedGroupIds) ? av.allowedGroupIds : [],
      });
      if (this.attrs.onCreated) this.attrs.onCreated();
      app.alerts.show({ type: 'success' }, app.translator.trans('ramon-point-system.admin.name.created'));
      this.hide();
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Create failed');
    } finally {
      this.saving = false;
      m.redraw();
    }
  }

  parseInlineCss(css: string): Record<string, string> {
    if (!css) return {};
    const out: Record<string, string> = {};
    css.split(';').forEach((decl) => {
      const idx = decl.indexOf(':');
      if (idx <= 0) return;
      let prop = decl.slice(0, idx).trim();
      let val = decl
        .slice(idx + 1)
        .trim()
        .replace(/[<>]/g, '');
      if (!prop) return;
      prop = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      out[prop] = val;
    });
    return out;
  }
}
