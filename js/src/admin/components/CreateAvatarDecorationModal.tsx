// @ts-nocheck
import app from 'flarum/admin/app';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import AvailabilityInputs from './AvailabilityInputs';
import { pointsLabel } from '../../common/utils/pointsLabel';

const SOURCE_FILE = 'file';
const SOURCE_URL = 'url';

/**
 * Create modal for a new avatar frame. Handles both:
 *  - multipart file upload via /point-system/avatar-decoration/upload, then
 *    a PATCH to attach availability metadata to the freshly-created row
 *  - JSON:API create with `imageUrl` (no upload — admin pastes a URL)
 *
 * Same dual-flow as the old inline create form on AvatarDecorationsPanel;
 * just lives in a modal now so the panel surface is dedicated to the grid.
 */
export default class CreateAvatarDecorationModal extends Modal {
  static dismissibleOptions = {
    viaEscKey: true,
    viaCloseButton: true,
    viaBackdropClick: false,
  };

  source: 'file' | 'url' = SOURCE_FILE;
  draft: any = {
    name: '',
    description: '',
    price: '100',
    file: null as File | null,
    imageUrl: '',
    availability: {
      maxClaims: null,
      claimCount: 0,
      availableFrom: '',
      availableUntil: '',
      isListed: true,
      allowedGroupIds: [],
    },
  };
  uploading = false;

  className() {
    return 'EditDecorationModal CreateDecorationModal Modal--medium';
  }

  title() {
    return app.translator.trans('ramon-point-system.admin.avatar.upload_title');
  }

  canSubmit(): boolean {
    if (!this.draft.name.trim()) return false;
    if (this.source === SOURCE_FILE) return !!this.draft.file;
    return !!this.draft.imageUrl.trim();
  }

  content() {
    const draft = this.draft;
    const t = (k: string) => app.translator.trans('ramon-point-system.admin.avatar.' + k);

    return (
      <div className="Modal-body">
        <div className="Form-group">
          <label>{t('field_name')}</label>
          <input className="FormControl" value={draft.name} oninput={(e: Event) => (draft.name = (e.target as HTMLInputElement).value)} autofocus />
        </div>

        <div className="Form-group">
          <label>{t('field_description')}</label>
          <input
            className="FormControl"
            value={draft.description}
            oninput={(e: Event) => (draft.description = (e.target as HTMLInputElement).value)}
          />
        </div>

        <div className="Form-group">
          <label>
            {t('field_price')} ({pointsLabel(app)})
          </label>
          <input
            type="number"
            min="0"
            className="FormControl"
            value={draft.price}
            oninput={(e: Event) => (draft.price = (e.target as HTMLInputElement).value)}
          />
        </div>

        <div className="PointSystemAdmin-imageSource">
          <div className="Form-group">
            <label>{t('source_label')}</label>
            <div className="PointSystemAdmin-sourceTabs">
              <label>
                <input
                  type="radio"
                  name="ps-create-avatar-source"
                  checked={this.source === SOURCE_FILE}
                  onchange={() => (this.source = SOURCE_FILE)}
                />{' '}
                {t('source_file')}
              </label>
              <label>
                <input type="radio" name="ps-create-avatar-source" checked={this.source === SOURCE_URL} onchange={() => (this.source = SOURCE_URL)} />{' '}
                {t('source_url')}
              </label>
            </div>
          </div>

          {this.source === SOURCE_FILE && (
            <div className="Form-group">
              <label>{t('field_image')}</label>
              <input
                type="file"
                accept="image/png,image/gif,image/webp,image/apng"
                onchange={(e: Event) => (draft.file = (e.target as HTMLInputElement).files?.[0] || null)}
              />
              <p className="helpText">{t('field_image_help')}</p>
            </div>
          )}
          {this.source === SOURCE_URL && (
            <div className="Form-group">
              <label>{t('field_image_url')}</label>
              <input
                type="url"
                className="FormControl"
                placeholder="https://example.com/frame.png"
                value={draft.imageUrl}
                oninput={(e: Event) => (draft.imageUrl = (e.target as HTMLInputElement).value)}
              />
              <p className="helpText">{t('field_image_url_help')}</p>
            </div>
          )}
        </div>

        <AvailabilityInputs state={draft.availability} onchange={(s: any) => (draft.availability = s)} />

        <div className="Form-group EditDecorationModal-actions">
          <Button
            className="Button Button--primary"
            loading={this.uploading}
            disabled={this.uploading || !this.canSubmit()}
            onclick={() => this.commit()}
          >
            <i className="fas fa-plus" /> {t('upload')}
          </Button>
          <Button className="Button" disabled={this.uploading} onclick={() => this.hide()}>
            {app.translator.trans('ramon-point-system.admin.cancel')}
          </Button>
        </div>
      </div>
    );
  }

  async commit() {
    if (!this.canSubmit()) return;
    const draft = this.draft;
    this.uploading = true;
    m.redraw();

    try {
      const av = draft.availability || {};
      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');

      if (this.source === SOURCE_FILE) {
        // Multipart upload first, then PATCH availability onto the new row.
        const form = new FormData();
        form.append('image', draft.file!);
        form.append('name', draft.name);
        form.append('description', draft.description);
        form.append('price', draft.price);

        const created: any = await app.request({
          method: 'POST',
          url: `${apiUrl}/point-system/avatar-decoration/upload`,
          serialize: (b: any) => b,
          body: form,
        } as any);

        const createdId = created?.data?.id;
        if (createdId) {
          await app.request({
            method: 'PATCH',
            url: `${apiUrl}/point-system-avatar-decorations/${createdId}`,
            body: {
              data: {
                type: 'point-system-avatar-decorations',
                id: String(createdId),
                attributes: {
                  maxClaims: av.maxClaims,
                  availableFrom: av.availableFrom || null,
                  availableUntil: av.availableUntil || null,
                  isListed: !!av.isListed,
                  allowedGroupIds: Array.isArray(av.allowedGroupIds) ? av.allowedGroupIds : [],
                },
              },
            },
          });
        }
      } else {
        // URL flow — pure JSON:API create.
        await app.store.createRecord('point-system-avatar-decorations').save({
          name: draft.name,
          description: draft.description || null,
          price: Math.max(0, Number(draft.price) || 0),
          imageUrl: draft.imageUrl.trim(),
          maxClaims: av.maxClaims,
          availableFrom: av.availableFrom || null,
          availableUntil: av.availableUntil || null,
          isListed: !!av.isListed,
          allowedGroupIds: Array.isArray(av.allowedGroupIds) ? av.allowedGroupIds : [],
        });
      }

      if (this.attrs.onCreated) this.attrs.onCreated();
      app.alerts.show({ type: 'success' }, app.translator.trans('ramon-point-system.admin.avatar.uploaded'));
      this.hide();
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Upload failed');
    } finally {
      this.uploading = false;
      m.redraw();
    }
  }
}
