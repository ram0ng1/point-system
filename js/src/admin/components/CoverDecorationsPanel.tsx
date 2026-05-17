// @ts-nocheck
import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import GrantItemModal from './GrantItemModal';
import EditCoverDecorationModal from './EditCoverDecorationModal';
import CreateCoverDecorationModal from './CreateCoverDecorationModal';
import { pointsLabel } from '../../common/utils/pointsLabel';

/**
 * Admin panel for shop-sold profile covers. Mirrors AvatarDecorationsPanel.
 * Create flow lives in CreateCoverDecorationModal.
 */
export default class CoverDecorationsPanel extends Component {
  loading = true;
  items: any[] = [];

  oninit(vnode: any) {
    super.oninit(vnode);
    this.load();
  }

  async load() {
    this.loading = true;
    try {
      const res = await app.store.find('point-system-cover-decorations');
      this.items = (Array.isArray(res) ? res : []).filter(Boolean);
    } finally {
      this.loading = false;
      m.redraw();
    }
  }

  view() {
    if (this.loading) return <LoadingIndicator />;

    const t = (k: string) => app.translator.trans('ramon-point-system.admin.cover.' + k);

    return (
      <div className="PointSystemAdmin-section">
        <div className="PointSystemAdmin-section-header PointSystemAdmin-section-header--withAction">
          <div>
            <h2>{t('title')}</h2>
            <p className="helpText">{t('help')}</p>
          </div>
          <Button className="Button Button--primary" onclick={() => app.modal.show(CreateCoverDecorationModal, { onCreated: () => this.load() })}>
            <i className="fas fa-plus" /> {t('upload')}
          </Button>
        </div>

        {this.items.length === 0 && <p className="PointSystemAdmin-empty">{t('none')}</p>}

        <div className="PointSystemAdmin-coverGrid">{this.items.map((it) => this.renderItem(it))}</div>
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
    const t = (k: string) => app.translator.trans('ramon-point-system.admin.' + k);

    return (
      <div className={`PointSystemAdmin-coverCard ${enabled ? '' : 'is-disabled'} ${listed ? '' : 'is-unlisted'}`}>
        <div className="PointSystemAdmin-coverCard-preview">{url && <img src={url} alt={name} />}</div>
        <div className="PointSystemAdmin-coverCard-meta">
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
        <div className="PointSystemAdmin-coverCard-actions">
          <Button
            className="Button"
            onclick={() =>
              app.modal.show(EditCoverDecorationModal, {
                deco,
                onSaved: () => this.load(),
              })
            }
          >
            <i className="fas fa-pen" /> {t('edit')}
          </Button>
          <Button className="Button" onclick={() => this.saveField(deco, 'isEnabled', !enabled)}>
            <i className={enabled ? 'fas fa-ban' : 'fas fa-check'} /> {enabled ? t('disable') : t('enable')}
          </Button>
          <Button
            className="Button"
            onclick={() =>
              app.modal.show(GrantItemModal, {
                itemType: 'cover_decoration',
                itemId: deco.id(),
                itemLabel: name,
                onGranted: () => this.load(),
              })
            }
          >
            <i className="fas fa-gift" /> {app.translator.trans('ramon-point-system.admin.grant.action_button')}
          </Button>
          <Button className="Button Button--danger" onclick={() => this.remove(id)}>
            <i className="fas fa-trash" /> {t('delete')}
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
      await app.request({ method: 'DELETE', url: `${apiUrl}/point-system/cover-decoration/${id}` });
      await this.load();
    } catch {
      app.alerts.show({ type: 'error' }, 'Failed to delete');
    }
  }

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
