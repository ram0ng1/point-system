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

/**
 * Edit modal for an existing name decoration. Mirrors the fields the panel's
 * inline form used to render, but lives in a Modal so the admin can focus on
 * one item at a time without the grid below distracting them.
 *
 * Attrs:
 *   - deco:   the decoration model being edited
 *   - onSaved?: () => void   called after a successful save (parent panel
 *                            uses this to refresh the grid)
 */
export default class EditNameDecorationModal extends Modal {
  static dismissibleOptions = {
    viaEscKey: true,
    viaCloseButton: true,
    viaBackdropClick: false, // edits unsaved → require explicit cancel
  };

  draft: any = null;
  saving = false;

  oninit(vnode: any) {
    super.oninit(vnode);
    const deco = this.attrs.deco;
    this.draft = {
      name: deco.attribute('name') || '',
      description: deco.attribute('description') || '',
      preset: deco.attribute('preset') || 'custom',
      price: deco.attribute('price') || 0,
      customCss: deco.attribute('customCss') || '',
      availability: {
        maxClaims: deco.attribute('maxClaims'),
        claimCount: Number(deco.attribute('claimCount') ?? 0),
        availableFrom: deco.attribute('availableFrom') || '',
        availableUntil: deco.attribute('availableUntil') || '',
        isListed: deco.attribute('isListed') !== false,
        allowedGroupIds: Array.isArray(deco.attribute('allowedGroupIds')) ? deco.attribute('allowedGroupIds') : [],
      },
    };
  }

  className() {
    return 'EditDecorationModal Modal--medium';
  }

  title() {
    return app.translator.trans('ramon-point-system.admin.name.edit_title', {
      name: this.attrs.deco.attribute('name') || '',
    });
  }

  content() {
    const deco = this.attrs.deco;
    const draft = this.draft;
    const slug = deco.attribute('slug');
    const previewStyle = draft.preset === 'custom' && !String(draft.customCss).includes('{') ? this.parseInlineCss(draft.customCss) : null;
    const t = (k: string) => app.translator.trans('ramon-point-system.admin.name.' + k);

    return (
      <div className="Modal-body">
        <div className="PointSystemAdmin-decoCard-preview">
          <span className={`ps-name-preview ps-name-${String(slug).replace(/[^a-zA-Z0-9_-]/g, '')}`} style={previewStyle}>
            {draft.name || 'Username'}
          </span>
        </div>
        <div className="Form-group">
          <label>{t('field_name')}</label>
          <input className="FormControl" value={draft.name} oninput={(e: Event) => (draft.name = (e.target as HTMLInputElement).value)} />
        </div>
        <div className="Form-group">
          <label>{t('field_description')}</label>
          <input
            className="FormControl"
            value={draft.description ?? ''}
            oninput={(e: Event) => (draft.description = (e.target as HTMLInputElement).value)}
          />
        </div>
        <div className="Form-group">
          <label>{t('field_preset')}</label>
          <select
            className="FormControl"
            value={draft.preset || 'custom'}
            onchange={(e: Event) => (draft.preset = (e.target as HTMLSelectElement).value)}
          >
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
          <label>{t('field_css')}</label>
          <textarea
            className="FormControl PointSystemAdmin-css"
            rows={6}
            value={draft.customCss ?? ''}
            oninput={(e: Event) => (draft.customCss = (e.target as HTMLTextAreaElement).value)}
          />
          <p className="helpText">{t('field_css_help')}</p>
        </div>

        <AvailabilityInputs state={draft.availability} onchange={(s: any) => (draft.availability = s)} />

        <div className="Form-group EditDecorationModal-actions">
          <Button className="Button Button--primary" loading={this.saving} disabled={this.saving} onclick={() => this.commit()}>
            <i className="fas fa-save" /> {app.translator.trans('ramon-point-system.admin.save')}
          </Button>
          <Button className="Button" disabled={this.saving} onclick={() => this.hide()}>
            {app.translator.trans('ramon-point-system.admin.cancel')}
          </Button>
        </div>
      </div>
    );
  }

  async commit() {
    const deco = this.attrs.deco;
    const draft = this.draft;
    this.saving = true;
    m.redraw();
    try {
      const av = draft.availability || {};
      await deco.save({
        name: draft.name,
        description: draft.description || null,
        preset: draft.preset,
        price: Number(draft.price) || 0,
        customCss: draft.customCss || null,
        maxClaims: av.maxClaims,
        availableFrom: av.availableFrom || null,
        availableUntil: av.availableUntil || null,
        isListed: !!av.isListed,
        allowedGroupIds: Array.isArray(av.allowedGroupIds) ? av.allowedGroupIds : [],
      });
      if (this.attrs.onSaved) this.attrs.onSaved();
      this.hide();
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Failed');
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
