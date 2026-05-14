// @ts-nocheck
import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';

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

export default class NameDecorationsPanel extends Component {
  loading = true;
  items: any[] = [];
  saving = false;

  // create form
  draft = { name: '', description: '', preset: 'fire', price: 50, customCss: '' };

  // per-row edit buffers keyed by deco id; presence = card is in edit mode
  edits: Record<string, any> = {};

  oninit(vnode: any) {
    super.oninit(vnode);
    this.load();
  }

  async load() {
    this.loading = true;
    try {
      const res = await app.store.find('point-system-name-decorations');
      this.items = Array.isArray(res) ? res.slice() : [];
    } finally {
      this.loading = false;
      m.redraw();
    }
  }

  view() {
    if (this.loading) return <LoadingIndicator />;

    return (
      <div className="PointSystemAdmin-section">
        <div className="PointSystemAdmin-section-header">
          <h2>{app.translator.trans('ramon-point-system.admin.name.title')}</h2>
          <p className="helpText">{app.translator.trans('ramon-point-system.admin.name.help')}</p>
        </div>

        <div className="PointSystemAdmin-uploader">
          <h3>{app.translator.trans('ramon-point-system.admin.name.create_title')}</h3>

          <div className="Form-group">
            <label>{app.translator.trans('ramon-point-system.admin.name.field_name')}</label>
            <input className="FormControl" value={this.draft.name} oninput={(e: Event) => (this.draft.name = (e.target as HTMLInputElement).value)} />
          </div>

          <div className="Form-group">
            <label>{app.translator.trans('ramon-point-system.admin.name.field_preset')}</label>
            <select
              className="FormControl"
              value={this.draft.preset}
              onchange={(e: Event) => (this.draft.preset = (e.target as HTMLSelectElement).value)}
            >
              {BUILTIN_PRESETS.map((p) => (
                <option value={p}>{app.translator.trans(`ramon-point-system.admin.name.preset_${p}`)}</option>
              ))}
              <option value="custom">{app.translator.trans('ramon-point-system.admin.name.preset_custom')}</option>
            </select>
          </div>

          <div className="Form-group">
            <label>{app.translator.trans('ramon-point-system.admin.name.field_price')}</label>
            <input
              type="number"
              min="0"
              className="FormControl"
              value={this.draft.price}
              oninput={(e: Event) => (this.draft.price = Number((e.target as HTMLInputElement).value))}
            />
          </div>

          <div className="Form-group">
            <label>{app.translator.trans('ramon-point-system.admin.name.field_description')}</label>
            <input
              className="FormControl"
              value={this.draft.description}
              oninput={(e: Event) => (this.draft.description = (e.target as HTMLInputElement).value)}
            />
          </div>

          <div className="Form-group">
            <label>{app.translator.trans('ramon-point-system.admin.name.field_css')}</label>
            <textarea
              className="FormControl PointSystemAdmin-css"
              rows={6}
              placeholder="color: gold; text-shadow: 0 0 6px gold;"
              value={this.draft.customCss}
              oninput={(e: Event) => (this.draft.customCss = (e.target as HTMLTextAreaElement).value)}
            />
            <p className="helpText">{app.translator.trans('ramon-point-system.admin.name.field_css_help')}</p>
          </div>

          <div className="PointSystemAdmin-preview">
            <span>{app.translator.trans('ramon-point-system.admin.name.preview')}:</span>
            <span
              className={`ps-name-preview ps-name-${this.draft.preset === 'custom' ? '__livecustom' : this.draft.preset}`}
              style={this.draft.preset === 'custom' ? this.parseInlineCss(this.draft.customCss) : null}
            >
              Username
            </span>
          </div>

          <Button className="Button Button--primary" loading={this.saving} disabled={!this.draft.name.trim()} onclick={() => this.create()}>
            {app.translator.trans('ramon-point-system.admin.name.create')}
          </Button>
        </div>

        <h3>{app.translator.trans('ramon-point-system.admin.name.existing')}</h3>
        {this.items.length === 0 && <p className="PointSystemAdmin-empty">{app.translator.trans('ramon-point-system.admin.name.none')}</p>}

        {/* When any card is in edit mode, render its form OUTSIDE the grid so
            it takes the full container width instead of one auto-fill cell. */}
        {this.renderActiveEdit()}

        <div className="PointSystemAdmin-decoGrid">{this.items.map((d) => this.renderItem(d))}</div>
      </div>
    );
  }

  renderActiveEdit() {
    const ids = Object.keys(this.edits);
    if (ids.length === 0) return null;
    const id = ids[0];
    const deco = this.items.find((d) => String(d.id()) === id);
    if (!deco) return null;
    return this.renderEditForm(deco, this.edits[id]);
  }

  renderItem(deco: any) {
    const id = String(deco.id());
    const slug = deco.attribute('slug');
    const enabled = !!deco.attribute('isEnabled');
    if (this.edits[id]) return null; // editing form is rendered above the grid

    const name = deco.attribute('name');
    const preset = deco.attribute('preset');
    const price = deco.attribute('price');

    return (
      <div className={`PointSystemAdmin-decoCard ${enabled ? '' : 'is-disabled'}`}>
        <div className="PointSystemAdmin-decoCard-preview">
          <span className={`ps-name-preview ps-name-${String(slug).replace(/[^a-zA-Z0-9_-]/g, '')}`}>{name || 'Username'}</span>
        </div>
        <div className="PointSystemAdmin-decoCard-meta">
          <strong>{name}</strong>
          <small>
            {app.translator.trans('ramon-point-system.admin.name.preset')}: {preset || '—'} · {price} pts
          </small>
        </div>
        <div className="PointSystemAdmin-decoCard-actions">
          <Button className="Button" onclick={() => this.beginEdit(deco)}>
            <i className="fas fa-pen" /> {app.translator.trans('ramon-point-system.admin.edit')}
          </Button>
          <Button className="Button" onclick={() => this.saveField(deco, 'isEnabled', !enabled)}>
            {enabled ? app.translator.trans('ramon-point-system.admin.disable') : app.translator.trans('ramon-point-system.admin.enable')}
          </Button>
          <Button className="Button Button--danger" onclick={() => this.remove(deco)}>
            <i className="fas fa-trash" />
          </Button>
        </div>
      </div>
    );
  }

  renderEditForm(deco: any, draft: any) {
    const slug = deco.attribute('slug');
    const previewStyle = draft.preset === 'custom' && !String(draft.customCss).includes('{') ? this.parseInlineCss(draft.customCss) : null;

    return (
      <div className="PointSystemAdmin-decoCard PointSystemAdmin-decoCard--editing">
        <div className="PointSystemAdmin-decoCard-preview">
          <span className={`ps-name-preview ps-name-${String(slug).replace(/[^a-zA-Z0-9_-]/g, '')}`} style={previewStyle}>
            {draft.name || 'Username'}
          </span>
        </div>
        <div className="Form-group">
          <label>{app.translator.trans('ramon-point-system.admin.name.field_name')}</label>
          <input className="FormControl" value={draft.name} oninput={(e: Event) => (draft.name = (e.target as HTMLInputElement).value)} />
        </div>
        <div className="Form-group">
          <label>{app.translator.trans('ramon-point-system.admin.name.field_description')}</label>
          <input
            className="FormControl"
            value={draft.description ?? ''}
            oninput={(e: Event) => (draft.description = (e.target as HTMLInputElement).value)}
          />
        </div>
        <div className="Form-group">
          <label>{app.translator.trans('ramon-point-system.admin.name.field_preset')}</label>
          <select
            className="FormControl"
            value={draft.preset || 'custom'}
            onchange={(e: Event) => (draft.preset = (e.target as HTMLSelectElement).value)}
          >
            {BUILTIN_PRESETS.map((p) => (
              <option value={p}>{app.translator.trans(`ramon-point-system.admin.name.preset_${p}`)}</option>
            ))}
            <option value="custom">{app.translator.trans('ramon-point-system.admin.name.preset_custom')}</option>
          </select>
        </div>
        <div className="Form-group">
          <label>{app.translator.trans('ramon-point-system.admin.name.field_price')}</label>
          <input
            type="number"
            min="0"
            className="FormControl"
            value={draft.price}
            oninput={(e: Event) => (draft.price = Number((e.target as HTMLInputElement).value))}
          />
        </div>
        <div className="Form-group">
          <label>{app.translator.trans('ramon-point-system.admin.name.field_css')}</label>
          <textarea
            className="FormControl PointSystemAdmin-css"
            rows={6}
            value={draft.customCss ?? ''}
            oninput={(e: Event) => (draft.customCss = (e.target as HTMLTextAreaElement).value)}
          />
          <p className="helpText">{app.translator.trans('ramon-point-system.admin.name.field_css_help')}</p>
        </div>
        <div className="PointSystemAdmin-decoCard-actions">
          <Button className="Button Button--primary" onclick={() => this.commitEdit(deco)}>
            {app.translator.trans('ramon-point-system.admin.save')}
          </Button>
          <Button className="Button" onclick={() => this.cancelEdit(deco)}>
            {app.translator.trans('ramon-point-system.admin.cancel')}
          </Button>
        </div>
      </div>
    );
  }

  beginEdit(deco: any) {
    const id = String(deco.id());
    this.edits[id] = {
      name: deco.attribute('name') || '',
      description: deco.attribute('description') || '',
      preset: deco.attribute('preset') || 'custom',
      price: deco.attribute('price') || 0,
      customCss: deco.attribute('customCss') || '',
    };
  }

  cancelEdit(deco: any) {
    delete this.edits[String(deco.id())];
  }

  async commitEdit(deco: any) {
    const id = String(deco.id());
    const draft = this.edits[id];
    if (!draft) return;
    try {
      await deco.save({
        name: draft.name,
        description: draft.description || null,
        preset: draft.preset,
        price: Number(draft.price) || 0,
        customCss: draft.customCss || null,
      });
      delete this.edits[id];
      m.redraw();
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Failed');
    }
  }

  async create() {
    if (!this.draft.name.trim()) return;
    this.saving = true;
    m.redraw();
    try {
      await app.store.createRecord('point-system-name-decorations').save({
        name: this.draft.name,
        description: this.draft.description || null,
        preset: this.draft.preset,
        price: this.draft.price,
        customCss: this.draft.customCss || null,
      });
      this.draft = { name: '', description: '', preset: 'fire', price: 50, customCss: '' };
      await this.load();
      app.alerts.show({ type: 'success' }, app.translator.trans('ramon-point-system.admin.name.created'));
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Create failed');
    } finally {
      this.saving = false;
      m.redraw();
    }
  }

  async saveField(deco: any, attr: string, value: any) {
    try {
      await deco.save({ [attr]: value });
      m.redraw();
    } catch {
      app.alerts.show({ type: 'error' }, 'Failed');
    }
  }

  async remove(deco: any) {
    if (!confirm(app.translator.trans('ramon-point-system.admin.confirm_delete') as string)) return;
    try {
      await deco.delete();
      this.items = this.items.filter((i) => i !== deco);
      m.redraw();
    } catch {
      app.alerts.show({ type: 'error' }, 'Delete failed');
    }
  }

  /**
   * Very loose CSS-string → style-object parser used for the live preview only.
   * Properties land directly in a `style=` attr, so a single illegal char would
   * just be ignored by the browser — we still strip the obvious escapes.
   */
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
      // camelCase property name for mithril style attr
      prop = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      out[prop] = val;
    });
    return out;
  }
}
