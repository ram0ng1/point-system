// @ts-nocheck
import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';

/**
 * Admin panel for managing Title decorations. Each title is a short text
 * badge ("Veteran", "Patron") with an optional accent colour and free-form
 * CSS. Operations: list, create, toggle enabled, delete.
 */
export default class TitleDecorationsPanel extends Component {
  loading = true;
  items: any[] = [];
  saving = false;

  draft = { name: '', titleText: '', description: '', color: '#6cc04a', price: 100, customCss: '' };

  oninit(vnode: any) {
    super.oninit(vnode);
    this.load();
  }

  async load() {
    this.loading = true;
    try {
      const res = await app.store.find('point-system-title-decorations');
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
          <h2>{app.translator.trans('ramon-point-system.admin.title.title')}</h2>
          <p className="helpText">{app.translator.trans('ramon-point-system.admin.title.help')}</p>
        </div>

        <div className="PointSystemAdmin-uploader">
          <h3>{app.translator.trans('ramon-point-system.admin.title.create_title')}</h3>

          <div className="Form-group">
            <label>{app.translator.trans('ramon-point-system.admin.title.field_name')}</label>
            <input className="FormControl" value={this.draft.name} oninput={(e: Event) => (this.draft.name = (e.target as HTMLInputElement).value)} />
          </div>

          <div className="Form-group">
            <label>{app.translator.trans('ramon-point-system.admin.title.field_title_text')}</label>
            <input
              className="FormControl"
              maxlength="60"
              value={this.draft.titleText}
              oninput={(e: Event) => (this.draft.titleText = (e.target as HTMLInputElement).value)}
            />
            <p className="helpText">{app.translator.trans('ramon-point-system.admin.title.field_title_text_help')}</p>
          </div>

          <div className="Form-group">
            <label>{app.translator.trans('ramon-point-system.admin.title.field_color')}</label>
            <input
              className="FormControl"
              value={this.draft.color}
              oninput={(e: Event) => (this.draft.color = (e.target as HTMLInputElement).value)}
            />
            <p className="helpText">{app.translator.trans('ramon-point-system.admin.title.field_color_help')}</p>
          </div>

          <div className="Form-group">
            <label>{app.translator.trans('ramon-point-system.admin.title.field_price')}</label>
            <input
              type="number"
              min="0"
              className="FormControl"
              value={this.draft.price}
              oninput={(e: Event) => (this.draft.price = Number((e.target as HTMLInputElement).value))}
            />
          </div>

          <div className="Form-group">
            <label>{app.translator.trans('ramon-point-system.admin.title.field_description')}</label>
            <input
              className="FormControl"
              value={this.draft.description}
              oninput={(e: Event) => (this.draft.description = (e.target as HTMLInputElement).value)}
            />
          </div>

          <div className="Form-group">
            <label>{app.translator.trans('ramon-point-system.admin.title.field_css')}</label>
            <textarea
              className="FormControl PointSystemAdmin-css"
              rows={4}
              placeholder="font-weight: 700; text-transform: uppercase;"
              value={this.draft.customCss}
              oninput={(e: Event) => (this.draft.customCss = (e.target as HTMLTextAreaElement).value)}
            />
            <p className="helpText">{app.translator.trans('ramon-point-system.admin.title.field_css_help')}</p>
          </div>

          <div className="PointSystemAdmin-preview">
            <span className="ps-title-preview" style={this.draft.color ? `--ps-title-color:${this.draft.color}` : null}>
              {this.draft.titleText || '—'}
            </span>
          </div>

          <Button
            className="Button Button--primary"
            disabled={this.saving || !this.draft.name.trim() || !this.draft.titleText.trim()}
            loading={this.saving}
            onclick={() => this.create()}
          >
            {app.translator.trans('ramon-point-system.admin.title.create')}
          </Button>
        </div>

        <div className="PointSystemAdmin-section-header">
          <h3>{app.translator.trans('ramon-point-system.admin.title.existing')}</h3>
        </div>

        {this.items.length === 0 ? (
          <p>{app.translator.trans('ramon-point-system.admin.title.none')}</p>
        ) : (
          <div className="PointSystemAdmin-grid">
            {this.items.map((it) => {
              const color = it.attribute('color');
              return (
                <div className="PointSystemAdmin-card" key={it.id()}>
                  <span className="ps-title-preview" style={color ? `--ps-title-color:${color}` : null}>
                    {it.attribute('titleText')}
                  </span>
                  <div className="PointSystemAdmin-card-body">
                    <div>
                      <strong>{it.attribute('name')}</strong>
                    </div>
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
    if (!this.draft.name.trim() || !this.draft.titleText.trim()) return;
    this.saving = true;
    try {
      const created = await app.store.createRecord('point-system-title-decorations').save({
        name: this.draft.name.trim(),
        titleText: this.draft.titleText.trim(),
        description: this.draft.description || null,
        color: this.draft.color || null,
        customCss: this.draft.customCss || null,
        price: Number(this.draft.price) || 0,
        isEnabled: true,
      });
      this.items.unshift(created);
      this.draft.name = '';
      this.draft.titleText = '';
      this.draft.description = '';
      this.draft.customCss = '';
      app.alerts.show({ type: 'success' }, app.translator.trans('ramon-point-system.admin.title.created'));
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
