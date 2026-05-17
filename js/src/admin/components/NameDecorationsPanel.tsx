// @ts-nocheck
import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import GrantItemModal from './GrantItemModal';
import EditNameDecorationModal from './EditNameDecorationModal';
import CreateNameDecorationModal from './CreateNameDecorationModal';
import { pointsLabel } from '../../common/utils/pointsLabel';

export default class NameDecorationsPanel extends Component {
  loading = true;
  items: any[] = [];

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
        <div className="PointSystemAdmin-section-header PointSystemAdmin-section-header--withAction">
          <div>
            <h2>{app.translator.trans('ramon-point-system.admin.name.title')}</h2>
            <p className="helpText">{app.translator.trans('ramon-point-system.admin.name.help')}</p>
          </div>
          <Button className="Button Button--primary" onclick={() => app.modal.show(CreateNameDecorationModal, { onCreated: () => this.load() })}>
            <i className="fas fa-plus" /> {app.translator.trans('ramon-point-system.admin.name.create')}
          </Button>
        </div>

        {this.items.length === 0 && <p className="PointSystemAdmin-empty">{app.translator.trans('ramon-point-system.admin.name.none')}</p>}

        <div className="PointSystemAdmin-decoGrid">{this.items.map((d) => this.renderItem(d))}</div>
      </div>
    );
  }

  renderItem(deco: any) {
    const slug = deco.attribute('slug');
    const enabled = !!deco.attribute('isEnabled');
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
            {app.translator.trans('ramon-point-system.admin.name.preset')}: {preset || '—'} · {price} {pointsLabel(app)}
          </small>
        </div>
        <div className="PointSystemAdmin-decoCard-actions">
          <Button
            className="Button"
            onclick={() =>
              app.modal.show(EditNameDecorationModal, {
                deco,
                onSaved: () => this.load(),
              })
            }
          >
            <i className="fas fa-pen" /> {app.translator.trans('ramon-point-system.admin.edit')}
          </Button>
          <Button className="Button" onclick={() => this.saveField(deco, 'isEnabled', !enabled)}>
            <i className={enabled ? 'fas fa-ban' : 'fas fa-check'} />{' '}
            {enabled ? app.translator.trans('ramon-point-system.admin.disable') : app.translator.trans('ramon-point-system.admin.enable')}
          </Button>
          <Button
            className="Button"
            onclick={() =>
              app.modal.show(GrantItemModal, {
                itemType: 'name_decoration',
                itemId: deco.id(),
                itemLabel: name,
                onGranted: () => this.load(),
              })
            }
          >
            <i className="fas fa-gift" /> {app.translator.trans('ramon-point-system.admin.grant.action_button')}
          </Button>
          <Button className="Button Button--danger" onclick={() => this.remove(deco)}>
            <i className="fas fa-trash" /> {app.translator.trans('ramon-point-system.admin.delete')}
          </Button>
        </div>
      </div>
    );
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
}
