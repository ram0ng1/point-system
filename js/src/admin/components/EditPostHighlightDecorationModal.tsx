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

/**
 * Edit modal for an existing post-highlight decoration. Same shape as the
 * other Edit*DecorationModal classes — opens over the admin grid, keeps
 * edits in a local draft until the admin clicks Save.
 */
export default class EditPostHighlightDecorationModal extends Modal {
  static dismissibleOptions = {
    viaEscKey: true,
    viaCloseButton: true,
    viaBackdropClick: false,
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
    return app.translator.trans('ramon-point-system.admin.post_hl.edit_title', {
      name: this.attrs.deco.attribute('name') || '',
    });
  }

  content() {
    const deco = this.attrs.deco;
    const draft = this.draft;
    const slug = String(deco.attribute('slug') || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const safePreset = String(draft.preset || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const presetCls = safePreset && safePreset !== 'custom' ? `ps-posthl-${safePreset}` : '';
    const t = (k: string) => app.translator.trans('ramon-point-system.admin.post_hl.' + k);

    return (
      <div className="Modal-body">
        <div className="PointSystemAdmin-preview">
          <div className={`ps-posthl-preview ps-posthl-${slug} ${presetCls}`}>
            <div className="ps-posthl-preview-avatar" />
            <div className="ps-posthl-preview-body">
              <div className="ps-posthl-preview-line" />
              <div className="ps-posthl-preview-line short" />
            </div>
          </div>
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
          <label>{t('field_css')}</label>
          <textarea
            className="FormControl PointSystemAdmin-css"
            rows={4}
            placeholder="& { outline: 2px solid gold; outline-offset: 4px; }"
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
        // Only persist customCss when the preset is "custom" — otherwise it's
        // dead weight that the renderer ignores anyway.
        customCss: draft.preset === 'custom' ? draft.customCss || null : null,
        price: Number(draft.price) || 0,
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
}
