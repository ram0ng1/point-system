// @ts-nocheck
import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';

const BUILTIN_PRESETS = [
  'gold-border', 'silver-border', 'glow-blue', 'glow-purple',
  'glow-green', 'ribbon-red', 'ribbon-gold', 'dashed-accent',
  'gradient-edge', 'shadow-soft',
];

/**
 * Admin panel for managing post-highlight decorations. Each highlight is a
 * preset (or custom CSS) applied around the user's posts when they equip it.
 */
export default class PostHighlightDecorationsPanel extends Component {
  loading = true;
  items: any[] = [];
  saving = false;

  draft = { name: '', description: '', preset: 'gold-border', price: 150, customCss: '' };

  oninit(vnode: any) {
    super.oninit(vnode);
    this.load();
  }

  async load() {
    this.loading = true;
    try {
      const res = await app.store.find('point-system-post-highlight-decorations');
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
          <h2>{app.translator.trans('ramon-point-system.admin.post_hl.title')}</h2>
          <p className="helpText">{app.translator.trans('ramon-point-system.admin.post_hl.help')}</p>
        </div>

        <div className="PointSystemAdmin-uploader">
          <h3>{app.translator.trans('ramon-point-system.admin.post_hl.create_title')}</h3>

          <div className="Form-group">
            <label>{app.translator.trans('ramon-point-system.admin.post_hl.field_name')}</label>
            <input className="FormControl" value={this.draft.name}
              oninput={(e: Event) => (this.draft.name = (e.target as HTMLInputElement).value)} />
          </div>

          <div className="Form-group">
            <label>{app.translator.trans('ramon-point-system.admin.post_hl.field_preset')}</label>
            <select className="FormControl" value={this.draft.preset}
              onchange={(e: Event) => (this.draft.preset = (e.target as HTMLSelectElement).value)}>
              {BUILTIN_PRESETS.map((p) => (
                <option value={p}>{app.translator.trans(`ramon-point-system.admin.post_hl.preset_${p}`)}</option>
              ))}
              <option value="custom">{app.translator.trans('ramon-point-system.admin.post_hl.preset_custom')}</option>
            </select>
          </div>

          <div className="Form-group">
            <label>{app.translator.trans('ramon-point-system.admin.post_hl.field_price')}</label>
            <input type="number" min="0" className="FormControl" value={this.draft.price}
              oninput={(e: Event) => (this.draft.price = Number((e.target as HTMLInputElement).value))} />
          </div>

          <div className="Form-group">
            <label>{app.translator.trans('ramon-point-system.admin.post_hl.field_description')}</label>
            <input className="FormControl" value={this.draft.description}
              oninput={(e: Event) => (this.draft.description = (e.target as HTMLInputElement).value)} />
          </div>

          <div className="Form-group">
            <label>{app.translator.trans('ramon-point-system.admin.post_hl.field_css')}</label>
            <textarea
              className="FormControl PointSystemAdmin-css"
              rows={4}
              placeholder="& { outline: 2px solid gold; outline-offset: 4px; }"
              value={this.draft.customCss}
              oninput={(e: Event) => (this.draft.customCss = (e.target as HTMLTextAreaElement).value)}
            />
            <p className="helpText">{app.translator.trans('ramon-point-system.admin.post_hl.field_css_help')}</p>
          </div>

          <div className="PointSystemAdmin-preview">
            <div className={`ps-posthl-preview ps-posthl-${this.draft.preset}`}>
              <div className="ps-posthl-preview-avatar" />
              <div className="ps-posthl-preview-body">
                <div className="ps-posthl-preview-line" />
                <div className="ps-posthl-preview-line short" />
              </div>
            </div>
          </div>

          <Button
            className="Button Button--primary"
            disabled={this.saving || !this.draft.name.trim()}
            loading={this.saving}
            onclick={() => this.create()}
          >
            {app.translator.trans('ramon-point-system.admin.post_hl.create')}
          </Button>
        </div>

        <div className="PointSystemAdmin-section-header">
          <h3>{app.translator.trans('ramon-point-system.admin.post_hl.existing')}</h3>
        </div>

        {this.items.length === 0 ? (
          <p>{app.translator.trans('ramon-point-system.admin.post_hl.none')}</p>
        ) : (
          <div className="PointSystemAdmin-grid">
            {this.items.map((it) => {
              const slug = String(it.attribute('slug') || '').replace(/[^a-zA-Z0-9_-]/g, '');
              return (
                <div className="PointSystemAdmin-card" key={it.id()}>
                  <div className={`ps-posthl-preview ps-posthl-${slug}`}>
                    <div className="ps-posthl-preview-avatar" />
                    <div className="ps-posthl-preview-body">
                      <div className="ps-posthl-preview-line" />
                      <div className="ps-posthl-preview-line short" />
                    </div>
                  </div>
                  <div className="PointSystemAdmin-card-body">
                    <div><strong>{it.attribute('name')}</strong></div>
                    <div className="helpText">{(it.attribute('price') || 0) + ' pts'}</div>
                  </div>
                  <div className="PointSystemAdmin-card-actions">
                    <Button className="Button" onclick={() => this.toggle(it)}>
                      {it.attribute('isEnabled')
                        ? app.translator.trans('ramon-point-system.admin.disable')
                        : app.translator.trans('ramon-point-system.admin.enable')}
                    </Button>
                    <Button className="Button" onclick={() => this.del(it)}>
                      <i className="fas fa-trash" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  async create() {
    if (!this.draft.name.trim()) return;
    this.saving = true;
    try {
      const created = await app.store.createRecord('point-system-post-highlight-decorations').save({
        name: this.draft.name.trim(),
        description: this.draft.description || null,
        preset: this.draft.preset,
        customCss: this.draft.preset === 'custom' ? this.draft.customCss : null,
        price: Number(this.draft.price) || 0,
        isEnabled: true,
      });
      this.items.unshift(created);
      this.draft.name = '';
      this.draft.description = '';
      this.draft.customCss = '';
      app.alerts.show({ type: 'success' }, app.translator.trans('ramon-point-system.admin.post_hl.created'));
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Error');
    } finally {
      this.saving = false;
      m.redraw();
    }
  }

  async toggle(it: any) {
    try {
      await it.save({ isEnabled: !it.attribute('isEnabled') });
      m.redraw();
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Error');
    }
  }

  async del(it: any) {
    if (!confirm(app.translator.trans('ramon-point-system.admin.confirm_delete') as string)) return;
    try {
      await it.delete();
      this.items = this.items.filter((x: any) => x.id() !== it.id());
      m.redraw();
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Error');
    }
  }
}
