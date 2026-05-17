// @ts-nocheck
import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import GrantItemModal from './GrantItemModal';
import EditPostHighlightDecorationModal from './EditPostHighlightDecorationModal';
import CreatePostHighlightDecorationModal from './CreatePostHighlightDecorationModal';
import { pointsLabel } from '../../common/utils/pointsLabel';

/**
 * Admin panel for managing post-highlight decorations. Each highlight is a
 * preset (or custom CSS) applied around the user's posts when they equip it.
 */
export default class PostHighlightDecorationsPanel extends Component {
  loading = true;
  items: any[] = [];

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
        <div className="PointSystemAdmin-section-header PointSystemAdmin-section-header--withAction">
          <div>
            <h2>{app.translator.trans('ramon-point-system.admin.post_hl.title')}</h2>
            <p className="helpText">{app.translator.trans('ramon-point-system.admin.post_hl.help')}</p>
          </div>
          <Button
            className="Button Button--primary"
            onclick={() => app.modal.show(CreatePostHighlightDecorationModal, { onCreated: () => this.load() })}
          >
            <i className="fas fa-plus" /> {app.translator.trans('ramon-point-system.admin.post_hl.create')}
          </Button>
        </div>

        {this.items.length === 0 ? (
          <p className="PointSystemAdmin-empty">{app.translator.trans('ramon-point-system.admin.post_hl.none')}</p>
        ) : (
          <div className="PointSystemAdmin-grid">
            {this.items.map((it) => {
              const slug = String(it.attribute('slug') || '').replace(/[^a-zA-Z0-9_-]/g, '');
              const preset = String(it.attribute('preset') || '').replace(/[^a-zA-Z0-9_-]/g, '');
              // Built-in preset styles in decorations.less are scoped to
              // `.ps-posthl-<preset>` (e.g., `ps-posthl-gold-border`). Custom
              // CSS is runtime-scoped to `.ps-posthl-<slug>`. Apply both so
              // either source of styling lights up in the admin preview.
              const presetCls = preset && preset !== 'custom' ? `ps-posthl-${preset}` : '';
              return (
                <div className="PointSystemAdmin-card" key={it.id()}>
                  <div className={`ps-posthl-preview ps-posthl-${slug} ${presetCls}`}>
                    <div className="ps-posthl-preview-avatar" />
                    <div className="ps-posthl-preview-body">
                      <div className="ps-posthl-preview-line" />
                      <div className="ps-posthl-preview-line short" />
                    </div>
                  </div>
                  <div className="PointSystemAdmin-card-body">
                    <div>
                      <strong>{it.attribute('name')}</strong>
                    </div>
                    <div className="helpText">{(it.attribute('price') || 0) + ' ' + pointsLabel(app)}</div>
                  </div>
                  <div className="PointSystemAdmin-card-actions">
                    <Button
                      className="Button"
                      onclick={() =>
                        app.modal.show(EditPostHighlightDecorationModal, {
                          deco: it,
                          onSaved: () => this.load(),
                        })
                      }
                    >
                      <i className="fas fa-pen" /> {app.translator.trans('ramon-point-system.admin.edit')}
                    </Button>
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
                          itemType: 'post_highlight_decoration',
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
