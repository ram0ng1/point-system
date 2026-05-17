// @ts-nocheck
import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import GrantItemModal from './GrantItemModal';
import CreateTitleDecorationModal from './CreateTitleDecorationModal';
import { pointsLabel } from '../../common/utils/pointsLabel';

/**
 * Admin panel for managing Title decorations. Each title is a short text
 * badge ("Veteran", "Patron") with an optional accent colour and free-form
 * CSS. Operations: list, create (modal), toggle enabled, delete.
 */
export default class TitleDecorationsPanel extends Component {
  loading = true;
  items: any[] = [];

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
        <div className="PointSystemAdmin-section-header PointSystemAdmin-section-header--withAction">
          <div>
            <h2>{app.translator.trans('ramon-point-system.admin.title.title')}</h2>
            <p className="helpText">{app.translator.trans('ramon-point-system.admin.title.help')}</p>
          </div>
          <Button className="Button Button--primary" onclick={() => app.modal.show(CreateTitleDecorationModal, { onCreated: () => this.load() })}>
            <i className="fas fa-plus" /> {app.translator.trans('ramon-point-system.admin.title.create')}
          </Button>
        </div>

        {this.items.length === 0 ? (
          <p className="PointSystemAdmin-empty">{app.translator.trans('ramon-point-system.admin.title.none')}</p>
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
                    <div className="helpText">{(it.attribute('price') || 0) + ' ' + pointsLabel(app)}</div>
                  </div>
                  <div className="PointSystemAdmin-card-actions">
                    <Button className="Button" onclick={() => this.toggle(it)}>
                      <i className={it.attribute('isEnabled') ? 'fas fa-ban' : 'fas fa-check'} />{' '}
                      {it.attribute('isEnabled')
                        ? app.translator.trans('ramon-point-system.admin.disable')
                        : app.translator.trans('ramon-point-system.admin.enable')}
                    </Button>
                    <Button
                      className="Button"
                      onclick={() =>
                        app.modal.show(GrantItemModal, {
                          itemType: 'title_decoration',
                          itemId: it.id(),
                          itemLabel: it.attribute('name'),
                          onGranted: () => this.load(),
                        })
                      }
                    >
                      <i className="fas fa-gift" /> {app.translator.trans('ramon-point-system.admin.grant.action_button')}
                    </Button>
                    <Button className="Button Button--danger" onclick={() => this.del(it)}>
                      <i className="fas fa-trash" /> {app.translator.trans('ramon-point-system.admin.delete')}
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
