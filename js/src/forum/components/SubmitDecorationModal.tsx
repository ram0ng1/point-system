// @ts-nocheck
import app from 'flarum/forum/app';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';

const NAME_PRESETS = ['custom', 'gold', 'rainbow', 'neon', 'fire', 'ice', 'glitch', 'royal'];
const POST_HL_PRESETS = ['custom', 'gold-border', 'silver-border', 'glow-blue', 'glow-purple', 'glow-green', 'ribbon-red', 'shadow-soft'];

const SOURCE_FILE = 'file';
const SOURCE_URL = 'url';

/**
 * User-side modal for submitting a decoration design. Behaviour per type:
 *
 *  - avatar_decoration / cover_decoration   → File upload OR image URL
 *    (user picks one; file upload reuses the admin upload pipeline so the
 *    same size / extension / magic-byte / finfo defenses apply).
 *  - name_decoration / post_highlight_decoration → preset + optional CSS.
 *  - title_decoration → title text + optional color + optional CSS.
 *
 * Submissions land in `status=pending` server-side; the admin sees them
 * in the moderation queue. The submitter sees their own row in their
 * personal scope (the SubmissionScope filter on the catalog lets the
 * creator see their pending submission so they know it was received).
 *
 * Attrs:
 *   - type:  'avatar_decoration' | 'name_decoration' | ...
 *   - onSubmitted?: () => void   (parent panel callback to refresh)
 */
export default class SubmitDecorationModal extends Modal {
  busy = false;
  err = '';

  // Field state — supersets every type's shape. The submit() filters down
  // to the fields the chosen type accepts.
  name = '';
  description = '';
  imageUrl = '';
  imageFile: File | null = null;
  // For avatar/cover, the user picks between uploading a file or providing
  // a remote URL. File goes through the multipart pipeline that the admin
  // upload uses; URL is stored verbatim on the row and rendered as <img src>.
  source: 'file' | 'url' = SOURCE_FILE;
  preset = 'custom';
  customCss = '';
  titleText = '';
  color = '';

  className() {
    return 'PointSystemSubmitModal Modal--large';
  }

  title() {
    const family = this.familyKey();
    return app.translator.trans('ramon-point-system.forum.submit.title_with', {
      family: app.translator.trans('ramon-point-system.forum.submit.family_' + family),
    });
  }

  familyKey(): string {
    const type = String(this.attrs.type || '');
    return type === 'post_highlight_decoration' ? 'post_hl' : type.replace(/_decoration$/, '');
  }

  content() {
    const t = (k: string, v?: any) => app.translator.trans('ramon-point-system.forum.submit.' + k, v);
    const type = String(this.attrs.type || '');
    const isImage = type === 'avatar_decoration' || type === 'cover_decoration';
    const isName = type === 'name_decoration';
    const isTitle = type === 'title_decoration';
    const isPostHl = type === 'post_highlight_decoration';

    return (
      <div className="Modal-body PointSystemSubmitModal-body">
        <p className="helpText">{t('intro')}</p>

        <div className="Form-group">
          <label>{t('name_label')}</label>
          <input
            type="text"
            className="FormControl"
            value={this.name}
            maxLength={100}
            placeholder={t('name_placeholder') as string}
            oninput={(e: Event) => (this.name = (e.target as HTMLInputElement).value)}
            autofocus
          />
        </div>

        <div className="Form-group">
          <label>{t('description_label')}</label>
          <input
            type="text"
            className="FormControl"
            value={this.description}
            maxLength={500}
            oninput={(e: Event) => (this.description = (e.target as HTMLInputElement).value)}
          />
        </div>

        {isImage && (
          <div>
            <div className="Form-group PointSystemSubmitModal-source">
              <label>{t('source_label')}</label>
              <div className="PointSystemSubmitModal-sourceToggle">
                <label className={'PointSystemSubmitModal-sourceOption ' + (this.source === SOURCE_FILE ? 'is-active' : '')}>
                  <input
                    type="radio"
                    name="ps-submit-source"
                    value={SOURCE_FILE}
                    checked={this.source === SOURCE_FILE}
                    onchange={() => {
                      this.source = SOURCE_FILE;
                    }}
                  />
                  <i className="fas fa-upload" /> {t('source_file')}
                </label>
                <label className={'PointSystemSubmitModal-sourceOption ' + (this.source === SOURCE_URL ? 'is-active' : '')}>
                  <input
                    type="radio"
                    name="ps-submit-source"
                    value={SOURCE_URL}
                    checked={this.source === SOURCE_URL}
                    onchange={() => {
                      this.source = SOURCE_URL;
                    }}
                  />
                  <i className="fas fa-link" /> {t('source_url')}
                </label>
              </div>
            </div>

            {this.source === SOURCE_FILE ? (
              <div className="Form-group">
                <label>{t('image_file_label')}</label>
                <input
                  type="file"
                  className="FormControl"
                  accept={type === 'avatar_decoration' ? 'image/png,image/gif,image/webp,image/apng' : 'image/png,image/jpeg,image/gif,image/webp,image/apng'}
                  onchange={(e: Event) => {
                    const f = (e.target as HTMLInputElement).files?.[0] ?? null;
                    this.imageFile = f;
                  }}
                />
                <p className="helpText">{t('image_file_help')}</p>
              </div>
            ) : (
              <div className="Form-group">
                <label>{t('image_url_label')}</label>
                <input
                  type="url"
                  className="FormControl"
                  value={this.imageUrl}
                  placeholder="https://example.com/frame.png"
                  oninput={(e: Event) => (this.imageUrl = (e.target as HTMLInputElement).value)}
                />
                <p className="helpText">{t('image_url_help')}</p>
              </div>
            )}
          </div>
        )}

        {isTitle && (
          <div>
            <div className="Form-group">
              <label>{t('title_text_label')}</label>
              <input
                type="text"
                className="FormControl"
                value={this.titleText}
                maxLength={60}
                placeholder={t('title_text_placeholder') as string}
                oninput={(e: Event) => (this.titleText = (e.target as HTMLInputElement).value)}
              />
            </div>
            <div className="Form-group">
              <label>{t('color_label')}</label>
              <input
                type="text"
                className="FormControl"
                value={this.color}
                placeholder="#6cc04a"
                maxLength={24}
                oninput={(e: Event) => (this.color = (e.target as HTMLInputElement).value)}
              />
            </div>
          </div>
        )}

        {(isName || isPostHl) && (
          <div className="Form-group">
            <label>{t('preset_label')}</label>
            <select className="FormControl" value={this.preset} onchange={(e: Event) => (this.preset = (e.target as HTMLSelectElement).value)}>
              {(isName ? NAME_PRESETS : POST_HL_PRESETS).map((p) => (
                <option value={p}>{p}</option>
              ))}
            </select>
          </div>
        )}

        {(isName || isPostHl || isTitle) && (
          <div className="Form-group">
            <label>{t('custom_css_label')}</label>
            <textarea
              className="FormControl"
              rows={6}
              value={this.customCss}
              placeholder="color: gold;"
              oninput={(e: Event) => (this.customCss = (e.target as HTMLTextAreaElement).value)}
            />
            <p className="helpText">{t('custom_css_help')}</p>
          </div>
        )}

        {this.err && (
          <p className="PointSystemSubmitModal-error">
            <i className="fas fa-exclamation-triangle" /> {this.err}
          </p>
        )}

        <div className="PointSystemSubmitModal-footer">
          <p className="helpText">
            <i className="fas fa-info-circle" /> {t('moderation_notice')}
          </p>
          <Button
            className="Button Button--primary"
            loading={this.busy}
            disabled={!this.canSubmit() || this.busy}
            onclick={() => this.submit()}
          >
            <i className="fas fa-paper-plane" /> {t('submit')}
          </Button>
        </div>
      </div>
    );
  }

  canSubmit(): boolean {
    if (!this.name.trim()) return false;
    const type = String(this.attrs.type || '');
    if (type === 'avatar_decoration' || type === 'cover_decoration') {
      return this.source === SOURCE_FILE ? !!this.imageFile : !!this.imageUrl.trim();
    }
    if (type === 'title_decoration') {
      return !!this.titleText.trim();
    }
    return true;
  }

  async submit() {
    const type = String(this.attrs.type || '');
    const isImage = type === 'avatar_decoration' || type === 'cover_decoration';
    const apiType = ({
      avatar_decoration: 'point-system-avatar-decorations',
      name_decoration: 'point-system-name-decorations',
      cover_decoration: 'point-system-cover-decorations',
      title_decoration: 'point-system-title-decorations',
      post_highlight_decoration: 'point-system-post-highlight-decorations',
    } as Record<string, string>)[type];
    if (!apiType) return;

    this.busy = true;
    this.err = '';
    m.redraw();

    try {
      // For image types with a file source, route through the multipart
      // upload endpoint (server forces status=pending, creator_id=actor,
      // is_enabled=false). For URL source and the other types, use the
      // JSON:API store which already passes through the SubmissionScope
      // and policy checks.
      if (isImage && this.source === SOURCE_FILE && this.imageFile) {
        const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
        const uploadPath = type === 'avatar_decoration' ? 'avatar-decoration/upload' : 'cover-decoration/upload';
        const form = new FormData();
        form.append('image', this.imageFile);
        form.append('name', this.name.trim());
        if (this.description.trim()) form.append('description', this.description.trim());
        // No price field — non-manager uploads have price forced to 0 server-side.
        await app.request({
          method: 'POST',
          url: `${apiUrl}/point-system/${uploadPath}`,
          serialize: (b: any) => b,
          body: form,
        } as any);
      } else {
        const attrs: any = {
          name: this.name.trim(),
          description: this.description.trim() || null,
        };
        if (isImage) {
          attrs.imageUrl = this.imageUrl.trim();
        }
        if (type === 'name_decoration' || type === 'post_highlight_decoration') {
          attrs.preset = this.preset;
          attrs.customCss = this.customCss.trim() || null;
        }
        if (type === 'title_decoration') {
          attrs.titleText = this.titleText.trim();
          attrs.color = this.color.trim() || null;
          attrs.customCss = this.customCss.trim() || null;
        }
        await app.store.createRecord(apiType).save(attrs);
      }

      app.alerts.show({ type: 'success' }, app.translator.trans('ramon-point-system.forum.submit.submitted_alert'));
      if (this.attrs.onSubmitted) this.attrs.onSubmitted();
      this.hide();
    } catch (e: any) {
      this.err = e?.response?.errors?.[0]?.detail || 'Submission failed';
    } finally {
      this.busy = false;
      m.redraw();
    }
  }
}
