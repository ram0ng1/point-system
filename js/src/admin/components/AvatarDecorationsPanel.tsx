// @ts-nocheck
import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import GrantItemModal from './GrantItemModal';
import EditAvatarDecorationModal from './EditAvatarDecorationModal';
import CreateAvatarDecorationModal from './CreateAvatarDecorationModal';
import { pointsLabel } from '../../common/utils/pointsLabel';

export default class AvatarDecorationsPanel extends Component {
  loading = true;
  items: any[] = [];

  oninit(vnode: any) {
    super.oninit(vnode);
    this.load();
  }

  async load() {
    this.loading = true;
    try {
      const res = await app.store.find('point-system-avatar-decorations');
      this.items = (Array.isArray(res) ? res : []).filter(Boolean);
    } finally {
      this.loading = false;
      m.redraw();
    }
  }

  view() {
    if (this.loading) return <LoadingIndicator />;
    const t = (k: string) => app.translator.trans('ramon-point-system.admin.avatar.' + k);

    return (
      <div className="PointSystemAdmin-section">
        <div className="PointSystemAdmin-section-header PointSystemAdmin-section-header--withAction">
          <div>
            <h2>{t('title')}</h2>
            <p className="helpText">{t('help')}</p>
          </div>
          <Button className="Button Button--primary" onclick={() => app.modal.show(CreateAvatarDecorationModal, { onCreated: () => this.load() })}>
            <i className="fas fa-plus" /> {t('upload')}
          </Button>
        </div>

        {this.items.length === 0 && <p className="PointSystemAdmin-empty">{t('none')}</p>}

        <div className="PointSystemAdmin-decoGrid">{this.items.map((it) => this.renderItem(it))}</div>
      </div>
    );
  }

  renderItem(deco: any) {
    const id = String(deco.id());
    const url = this.previewUrl(deco);
    const name = deco.attribute('name') ?? '';
    const price = deco.attribute('price') ?? 0;
    const enabled = !!deco.attribute('isEnabled');
    const listed = deco.attribute('isListed') !== false;
    const claimCount = Number(deco.attribute('claimCount') ?? 0);
    const maxClaims = deco.attribute('maxClaims');

    return (
      <div className={`PointSystemAdmin-decoCard ${enabled ? '' : 'is-disabled'} ${listed ? '' : 'is-unlisted'}`}>
        <div className="PointSystemAdmin-decoCard-preview">{url && <img src={url} alt={name} />}</div>
        <div className="PointSystemAdmin-decoCard-meta">
          <strong>{name}</strong>
          <small>
            {price} {pointsLabel(app)}
          </small>
          {!listed && <span className="PointSystemAdmin-tag">{app.translator.trans('ramon-point-system.admin.availability.unlisted_tag')}</span>}
          {maxClaims != null && (
            <span className="PointSystemAdmin-tag">
              {claimCount}/{maxClaims}
            </span>
          )}
        </div>
        <div className="PointSystemAdmin-decoCard-actions">
          <Button
            className="Button"
            onclick={() =>
              app.modal.show(EditAvatarDecorationModal, {
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
                itemType: 'avatar_decoration',
                itemId: deco.id(),
                itemLabel: name,
                onGranted: () => this.load(),
              })
            }
          >
            <i className="fas fa-gift" /> {app.translator.trans('ramon-point-system.admin.grant.action_button')}
          </Button>
          <Button className="Button Button--danger" onclick={() => this.remove(id)}>
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
      app.alerts.show({ type: 'error' }, 'Failed to update');
    }
  }

  async remove(id: string) {
    if (!confirm(app.translator.trans('ramon-point-system.admin.confirm_delete') as string)) return;
    try {
      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
      await app.request({ method: 'DELETE', url: `${apiUrl}/point-system/avatar-decoration/${id}` });
      await this.load();
    } catch {
      app.alerts.show({ type: 'error' }, 'Failed to delete');
    }
  }

  // Resolve the preview image — prefer imageUrl when populated, otherwise
  // fall back to the locally hosted asset under imagePath.
  previewUrl(deco: any): string {
    const url = (deco.attribute('imageUrl') as string | undefined) || '';
    if (url) return url;
    const path = (deco.attribute('imagePath') as string | undefined) || '';
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    const base = (app.forum.attribute('assetsBaseUrl') as string | undefined) || (app.forum.attribute('baseUrl') as string) + '/assets';
    return base.replace(/\/+$/, '') + '/' + String(path).replace(/^\/+/, '');
  }
}
