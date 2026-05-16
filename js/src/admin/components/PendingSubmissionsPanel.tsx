// @ts-nocheck
import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';

const TYPE_LABEL: Record<string, string> = {
  avatar_decoration: 'avatar',
  name_decoration: 'name',
  cover_decoration: 'cover',
  title_decoration: 'title',
  post_highlight_decoration: 'post_hl',
};

/**
 * Admin moderation queue for user-submitted decorations. Lists every row
 * currently in status=pending across all five families, oldest first.
 *
 * Per row the admin can:
 *   - Approve  → flips status=approved + is_enabled=true. Optionally sets
 *                a price in the same click (otherwise the row enters the
 *                catalog at price 0 and the admin edits later).
 *   - Reject   → flips status=rejected + is_enabled=false. The submitter
 *                keeps seeing the row in their personal scope (so they
 *                know what happened) but it never reaches the public shop.
 *
 * Polling is intentionally off — the queue is admin-attention work, not a
 * live dashboard. Refresh button at the top of the page when needed.
 */
export default class PendingSubmissionsPanel extends Component {
  loading = true;
  items: any[] = [];
  priceDrafts: Record<string, string> = {};
  busy: Record<string, 'approve' | 'reject' | null> = {};

  oninit(vnode: any) {
    super.oninit(vnode);
    this.load();
  }

  async load() {
    this.loading = true;
    m.redraw();
    try {
      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
      const res: any = await app.request({ method: 'GET', url: `${apiUrl}/point-system/submissions` });
      this.items = Array.isArray(res?.data) ? res.data : [];
      for (const it of this.items) {
        const key = `${it.type}:${it.id}`;
        if (this.priceDrafts[key] === undefined) this.priceDrafts[key] = String(it.price || 0);
      }
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Failed to load submissions');
    } finally {
      this.loading = false;
      m.redraw();
    }
  }

  view() {
    if (this.loading) return <LoadingIndicator />;
    const t = (k: string) => app.translator.trans('ramon-point-system.admin.submissions.' + k);

    return (
      <div className="PointSystemAdmin-section">
        <div className="PointSystemAdmin-section-header">
          <h2>
            <i className="fas fa-inbox" /> {t('title')}
            <span className="PointSystemAdmin-counter">{this.items.length}</span>
          </h2>
          <p className="helpText">{t('help')}</p>
        </div>

        <div className="PointSystemAdmin-card">
          <div className="PointSystemAdmin-card-header" style="display:flex; justify-content:space-between; align-items:center;">
            <h3>{t('queue_heading')}</h3>
            <Button className="Button" onclick={() => this.load()}>
              <i className="fas fa-sync" /> {t('refresh')}
            </Button>
          </div>

          {this.items.length === 0 ? (
            <p className="PointSystemAdmin-empty">{t('empty')}</p>
          ) : (
            <div className="PointSystemAdmin-submissionList">{this.items.map((it) => this.renderRow(it))}</div>
          )}
        </div>
      </div>
    );
  }

  renderRow(it: any) {
    const t = (k: string, v?: any) => app.translator.trans('ramon-point-system.admin.submissions.' + k, v);
    const key = `${it.type}:${it.id}`;
    const busy = this.busy[key] ?? null;
    const familyKey = TYPE_LABEL[it.type] || it.type;
    const familyLabel = app.translator.trans('ramon-point-system.admin.tabs.' + familyKey);

    return (
      <div className="PointSystemAdmin-submission" key={key}>
        <div className="PointSystemAdmin-submission-preview">{this.renderPreview(it)}</div>

        <div className="PointSystemAdmin-submission-body">
          <div className="PointSystemAdmin-submission-meta">
            <span className="PointSystemAdmin-submission-family">{familyLabel}</span>
            <h4>{it.name}</h4>
            {it.description && <p className="helpText">{it.description}</p>}
          </div>

          {it.creator && (
            <div className="PointSystemAdmin-submission-creator">
              {it.creator.avatarUrl && <img src={it.creator.avatarUrl} alt="" />}
              <span>
                {t('by')} <strong>{it.creator.displayName || it.creator.username}</strong>
              </span>
              <span className="muted">· {this.formatTime(it.createdAt)}</span>
            </div>
          )}

          <div className="PointSystemAdmin-submission-fields">
            {it.preset && (
              <span className="PointSystemAdmin-tag">
                <i className="fas fa-palette" /> {it.preset}
              </span>
            )}
            {it.imageUrl && (
              <a className="PointSystemAdmin-tag" href={it.imageUrl} target="_blank" rel="noopener noreferrer">
                <i className="fas fa-external-link-alt" /> {t('image_url')}
              </a>
            )}
            {it.customCss && (
              <details className="PointSystemAdmin-submission-css">
                <summary>{t('show_custom_css')}</summary>
                <pre>{it.customCss}</pre>
              </details>
            )}
          </div>

          <div className="PointSystemAdmin-submission-actions">
            <div className="PointSystemAdmin-submission-price">
              <label>{t('price_label')}</label>
              <input
                type="number"
                min="0"
                className="FormControl"
                value={this.priceDrafts[key] ?? '0'}
                oninput={(e: Event) => (this.priceDrafts[key] = (e.target as HTMLInputElement).value)}
              />
            </div>
            <Button
              className="Button Button--primary"
              loading={busy === 'approve'}
              disabled={busy !== null}
              onclick={() => this.act(it, 'approve')}
            >
              <i className="fas fa-check" /> {t('approve')}
            </Button>
            <Button
              className="Button Button--danger"
              loading={busy === 'reject'}
              disabled={busy !== null}
              onclick={() => this.act(it, 'reject')}
            >
              <i className="fas fa-times" /> {t('reject')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  renderPreview(it: any) {
    if (it.imageUrl) {
      return <img className="PointSystemAdmin-submission-thumb" src={it.imageUrl} alt="" />;
    }
    if (it.imagePath) {
      const base = (app.forum.attribute('assetsBaseUrl') as string | undefined) || (app.forum.attribute('baseUrl') as string) + '/assets';
      const url = base.replace(/\/+$/, '') + '/' + String(it.imagePath).replace(/^\/+/, '');
      return <img className="PointSystemAdmin-submission-thumb" src={url} alt="" />;
    }
    if (it.type === 'name_decoration' && it.slug) {
      const slug = String(it.slug).replace(/[^a-zA-Z0-9_-]/g, '');
      return <span className={`ps-name-preview ps-name-${slug} PointSystemAdmin-submission-thumb`}>Aa</span>;
    }
    if (it.type === 'title_decoration' && it.titleText) {
      const slug = String(it.slug || '').replace(/[^a-zA-Z0-9_-]/g, '');
      const safe = String(it.color || '').replace(/[<>"';]/g, '');
      const style = safe ? `--ps-title-color:${safe};` : '';
      return (
        <span className={`ps-title-preview ps-title-${slug} PointSystemAdmin-submission-thumb`} style={style}>
          {it.titleText}
        </span>
      );
    }
    if (it.type === 'post_highlight_decoration' && it.slug) {
      const slug = String(it.slug).replace(/[^a-zA-Z0-9_-]/g, '');
      return (
        <div className={`ps-posthl-preview ps-posthl-${slug} PointSystemAdmin-submission-thumb`}>
          <div className="ps-posthl-preview-avatar" />
          <div className="ps-posthl-preview-body">
            <div className="ps-posthl-preview-line" />
            <div className="ps-posthl-preview-line short" />
          </div>
        </div>
      );
    }
    return (
      <span className="PointSystemAdmin-submission-thumb PointSystemAdmin-submission-thumb--placeholder">
        <i className="fas fa-cube" />
      </span>
    );
  }

  async act(it: any, action: 'approve' | 'reject') {
    const key = `${it.type}:${it.id}`;
    this.busy[key] = action;
    m.redraw();
    try {
      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
      const body: any = {};
      if (action === 'approve') {
        body.price = Math.max(0, Number(this.priceDrafts[key] ?? 0) || 0);
      }
      await app.request({
        method: 'POST',
        url: `${apiUrl}/point-system/submissions/${it.type}/${it.id}/${action}`,
        body,
      });
      // Remove from the visible queue immediately.
      this.items = this.items.filter((x: any) => !(x.type === it.type && Number(x.id) === Number(it.id)));
      app.alerts.show(
        { type: 'success' },
        app.translator.trans('ramon-point-system.admin.submissions.' + (action === 'approve' ? 'approved_alert' : 'rejected_alert'), {
          name: it.name,
        })
      );
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Action failed');
    } finally {
      this.busy[key] = null;
      m.redraw();
    }
  }

  formatTime(iso: string | null): string {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return '';
    }
  }
}
