// @ts-nocheck
import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import AvailabilityInputs from './AvailabilityInputs';
import GrantItemModal from './GrantItemModal';

const SOURCE_FILE = 'file';
const SOURCE_URL = 'url';

export default class AvatarDecorationsPanel extends Component {
  loading = true;
  items: any[] = [];
  uploading = false;

  // upload form state — admins can choose to upload a file or paste a URL.
  // Both flows write to the same row; only one of `image_path`/`image_url`
  // ends up populated (and the server falls back to the other).
  source: 'file' | 'url' = SOURCE_FILE;
  newName = '';
  newDescription = '';
  newPrice = '100';
  newFile: File | null = null;
  newImageUrl = '';
  newAvailability: any = {
    maxClaims: null,
    claimCount: 0,
    availableFrom: '',
    availableUntil: '',
    isListed: true,
    allowedGroupIds: [],
  };

  // per-row edit buffers keyed by deco id
  edits: Record<string, any> = {};

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
        <div className="PointSystemAdmin-section-header">
          <h2>{t('title')}</h2>
          <p className="helpText">{t('help')}</p>
        </div>

        <div className="PointSystemAdmin-uploader">
          <h3>{t('upload_title')}</h3>

          <div className="Form-group">
            <label>{t('source_label')}</label>
            <div className="PointSystemAdmin-sourceTabs">
              <label>
                <input type="radio" name="ps-avatar-source" checked={this.source === SOURCE_FILE} onchange={() => (this.source = SOURCE_FILE)} />{' '}
                {t('source_file')}
              </label>
              <label>
                <input type="radio" name="ps-avatar-source" checked={this.source === SOURCE_URL} onchange={() => (this.source = SOURCE_URL)} />{' '}
                {t('source_url')}
              </label>
            </div>
          </div>

          <div className="Form-group">
            <label>{t('field_name')}</label>
            <input className="FormControl" value={this.newName} oninput={(e: Event) => (this.newName = (e.target as HTMLInputElement).value)} />
          </div>

          <div className="Form-group">
            <label>{t('field_description')}</label>
            <input
              className="FormControl"
              value={this.newDescription}
              oninput={(e: Event) => (this.newDescription = (e.target as HTMLInputElement).value)}
            />
          </div>

          <div className="Form-group">
            <label>{t('field_price')}</label>
            <input
              type="number"
              min="0"
              className="FormControl"
              value={this.newPrice}
              oninput={(e: Event) => (this.newPrice = (e.target as HTMLInputElement).value)}
            />
          </div>

          {this.source === SOURCE_FILE && (
            <div className="Form-group">
              <label>{t('field_image')}</label>
              <input
                type="file"
                accept="image/png,image/gif,image/webp,image/apng"
                onchange={(e: Event) => (this.newFile = (e.target as HTMLInputElement).files?.[0] || null)}
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
                value={this.newImageUrl}
                oninput={(e: Event) => (this.newImageUrl = (e.target as HTMLInputElement).value)}
              />
              <p className="helpText">{t('field_image_url_help')}</p>
            </div>
          )}

          <AvailabilityInputs state={this.newAvailability} onchange={(s: any) => (this.newAvailability = s)} />

          <Button className="Button Button--primary" loading={this.uploading} disabled={!this.canSubmitNew()} onclick={() => this.create()}>
            {t('upload')}
          </Button>
        </div>

        <h3>{t('existing')}</h3>
        {this.items.length === 0 && <p className="PointSystemAdmin-empty">{t('none')}</p>}

        {/* Render the active edit form full-width above the grid. */}
        {this.renderActiveEdit()}

        <div className="PointSystemAdmin-decoGrid">{this.items.map((it) => this.renderItem(it))}</div>
      </div>
    );
  }

  canSubmitNew(): boolean {
    if (!this.newName.trim()) return false;
    if (this.source === SOURCE_FILE) return !!this.newFile;
    return !!this.newImageUrl.trim();
  }

  renderActiveEdit() {
    const ids = Object.keys(this.edits);
    if (ids.length === 0) return null;
    const id = ids[0];
    const deco = this.items.find((d) => String(d.id()) === id);
    if (!deco) return null;
    return this.renderEditForm(deco, this.edits[id]);
  }

  renderItem(deco: any) {
    const id = String(deco.id());
    if (this.edits[id]) return null; // editing form rendered above the grid

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
          <small>{price} pts</small>
          {!listed && <span className="PointSystemAdmin-tag">{app.translator.trans('ramon-point-system.admin.availability.unlisted_tag')}</span>}
          {maxClaims != null && (
            <span className="PointSystemAdmin-tag">
              {claimCount}/{maxClaims}
            </span>
          )}
        </div>
        <div className="PointSystemAdmin-decoCard-actions">
          <Button className="Button" onclick={() => this.beginEdit(deco)}>
            <i className="fas fa-pen" /> {app.translator.trans('ramon-point-system.admin.edit')}
          </Button>
          <Button className="Button" onclick={() => this.saveField(deco, 'isEnabled', !enabled)}>
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
            <i className="fas fa-trash" />
          </Button>
        </div>
      </div>
    );
  }

  renderEditForm(deco: any, draft: any) {
    const url = this.previewUrl(deco);
    const name = deco.attribute('name') ?? '';
    const t = (k: string) => app.translator.trans('ramon-point-system.admin.avatar.' + k);

    return (
      <div className="PointSystemAdmin-decoCard PointSystemAdmin-decoCard--editing">
        <div className="PointSystemAdmin-decoCard-preview">{url && <img src={url} alt={name} />}</div>
        <div className="Form-group">
          <label>{t('field_name')}</label>
          <input className="FormControl" value={draft.name} oninput={(e: Event) => (draft.name = (e.target as HTMLInputElement).value)} />
        </div>
        <div className="Form-group">
          <label>{t('field_description')}</label>
          <input
            className="FormControl"
            value={draft.description ?? ''}
            oninput={(e: Event) => (draft.description = (e.target as HTMLInputElement).value)}
          />
        </div>
        <div className="Form-group">
          <label>{t('field_price')}</label>
          <input
            type="number"
            min="0"
            className="FormControl"
            value={draft.price}
            oninput={(e: Event) => (draft.price = Number((e.target as HTMLInputElement).value))}
          />
        </div>
        <div className="Form-group">
          <label>{t('field_image_url')}</label>
          <input
            type="url"
            className="FormControl"
            placeholder="https://example.com/frame.png"
            value={draft.imageUrl ?? ''}
            oninput={(e: Event) => (draft.imageUrl = (e.target as HTMLInputElement).value)}
          />
          <p className="helpText">{t('field_image_url_help')}</p>
        </div>
        <div className="Form-group">
          <label>{t('replace_image')}</label>
          <input
            type="file"
            accept="image/png,image/gif,image/webp,image/apng"
            onchange={(e: Event) => (draft.newFile = (e.target as HTMLInputElement).files?.[0] || null)}
          />
          <p className="helpText">{t('field_image_help')}</p>
        </div>

        <AvailabilityInputs state={draft.availability} onchange={(s: any) => (draft.availability = s)} />

        <div className="PointSystemAdmin-decoCard-actions">
          <Button className="Button Button--primary" onclick={() => this.commitEdit(deco)}>
            {app.translator.trans('ramon-point-system.admin.save')}
          </Button>
          <Button className="Button" onclick={() => this.cancelEdit(deco)}>
            {app.translator.trans('ramon-point-system.admin.cancel')}
          </Button>
        </div>
      </div>
    );
  }

  beginEdit(deco: any) {
    this.edits[String(deco.id())] = {
      name: deco.attribute('name') || '',
      description: deco.attribute('description') || '',
      price: deco.attribute('price') || 0,
      imageUrl: deco.attribute('imageUrl') || '',
      newFile: null,
      availability: {
        maxClaims: deco.attribute('maxClaims'),
        claimCount: Number(deco.attribute('claimCount') ?? 0),
        availableFrom: deco.attribute('availableFrom') || '',
        availableUntil: deco.attribute('availableUntil') || '',
        isListed: deco.attribute('isListed') !== false,
        allowedGroupIds: Array.isArray(deco.attribute('allowedGroupIds')) ? deco.attribute('allowedGroupIds') : [],
      },
    };
  }

  cancelEdit(deco: any) {
    delete this.edits[String(deco.id())];
  }

  async commitEdit(deco: any) {
    const id = String(deco.id());
    const draft = this.edits[id];
    if (!draft) return;

    try {
      const av = draft.availability || {};
      const payload: any = {
        name: draft.name,
        description: draft.description || null,
        price: Number(draft.price) || 0,
        imageUrl: draft.imageUrl ? draft.imageUrl : null,
        maxClaims: av.maxClaims,
        availableFrom: av.availableFrom || null,
        availableUntil: av.availableUntil || null,
        isListed: !!av.isListed,
        allowedGroupIds: Array.isArray(av.allowedGroupIds) ? av.allowedGroupIds : [],
      };
      await deco.save(payload);

      if (draft.newFile) {
        const form = new FormData();
        form.append('image', draft.newFile);
        form.append('replace_id', String(deco.id()));
        const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
        await app.request({
          method: 'POST',
          url: `${apiUrl}/point-system/avatar-decoration/upload`,
          serialize: (b: any) => b,
          body: form,
        } as any);
      }

      delete this.edits[id];
      await this.load();
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Failed');
    }
  }

  async create() {
    if (!this.canSubmitNew()) return;
    this.uploading = true;
    m.redraw();

    try {
      if (this.source === SOURCE_FILE) {
        // Existing multipart flow: upload file, then immediately PATCH the
        // new row with availability fields via JSON:API.
        const form = new FormData();
        form.append('image', this.newFile!);
        form.append('name', this.newName);
        form.append('description', this.newDescription);
        form.append('price', this.newPrice);

        const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
        const created: any = await app.request({
          method: 'POST',
          url: `${apiUrl}/point-system/avatar-decoration/upload`,
          serialize: (b: any) => b,
          body: form,
        } as any);

        const createdId = created?.data?.id;
        if (createdId) {
          const av = this.newAvailability || {};
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
        // URL flow: pure JSON:API Create — no upload, the imageUrl carries.
        const av = this.newAvailability || {};
        await app.store.createRecord('point-system-avatar-decorations').save({
          name: this.newName,
          description: this.newDescription || null,
          price: Math.max(0, Number(this.newPrice) || 0),
          imageUrl: this.newImageUrl.trim(),
          maxClaims: av.maxClaims,
          availableFrom: av.availableFrom || null,
          availableUntil: av.availableUntil || null,
          isListed: !!av.isListed,
          allowedGroupIds: Array.isArray(av.allowedGroupIds) ? av.allowedGroupIds : [],
        });
      }

      // Reset form
      this.newName = '';
      this.newDescription = '';
      this.newPrice = '100';
      this.newFile = null;
      this.newImageUrl = '';
      this.newAvailability = {
        maxClaims: null,
        claimCount: 0,
        availableFrom: '',
        availableUntil: '',
        isListed: true,
        allowedGroupIds: [],
      };
      await this.load();
      app.alerts.show({ type: 'success' }, app.translator.trans('ramon-point-system.admin.avatar.uploaded'));
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Upload failed');
    } finally {
      this.uploading = false;
      m.redraw();
    }
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
