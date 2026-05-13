// @ts-nocheck
import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';

export default class AvatarDecorationsPanel extends Component {
  loading = true;
  items: any[] = [];
  uploading = false;

  // upload form state
  newName = '';
  newDescription = '';
  newPrice = '100';
  newFile: File | null = null;

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

    return (
      <div className="PointSystemAdmin-section">
        <div className="PointSystemAdmin-section-header">
          <h2>{app.translator.trans('ramon-point-system.admin.avatar.title')}</h2>
          <p className="helpText">{app.translator.trans('ramon-point-system.admin.avatar.help')}</p>
        </div>

        <div className="PointSystemAdmin-uploader">
          <h3>{app.translator.trans('ramon-point-system.admin.avatar.upload_title')}</h3>
          <div className="Form-group">
            <label>{app.translator.trans('ramon-point-system.admin.avatar.field_name')}</label>
            <input className="FormControl" value={this.newName} oninput={(e: Event) => (this.newName = (e.target as HTMLInputElement).value)} />
          </div>
          <div className="Form-group">
            <label>{app.translator.trans('ramon-point-system.admin.avatar.field_description')}</label>
            <input className="FormControl" value={this.newDescription} oninput={(e: Event) => (this.newDescription = (e.target as HTMLInputElement).value)} />
          </div>
          <div className="Form-group">
            <label>{app.translator.trans('ramon-point-system.admin.avatar.field_price')}</label>
            <input type="number" min="0" className="FormControl" value={this.newPrice} oninput={(e: Event) => (this.newPrice = (e.target as HTMLInputElement).value)} />
          </div>
          <div className="Form-group">
            <label>{app.translator.trans('ramon-point-system.admin.avatar.field_image')}</label>
            <input
              type="file"
              accept="image/png,image/gif,image/webp,image/apng"
              onchange={(e: Event) => (this.newFile = (e.target as HTMLInputElement).files?.[0] || null)}
            />
            <p className="helpText">{app.translator.trans('ramon-point-system.admin.avatar.field_image_help')}</p>
          </div>
          <Button
            className="Button Button--primary"
            loading={this.uploading}
            disabled={!this.newFile || !this.newName.trim()}
            onclick={() => this.upload()}
          >
            {app.translator.trans('ramon-point-system.admin.avatar.upload')}
          </Button>
        </div>

        <h3>{app.translator.trans('ramon-point-system.admin.avatar.existing')}</h3>
        {this.items.length === 0 && (
          <p className="PointSystemAdmin-empty">{app.translator.trans('ramon-point-system.admin.avatar.none')}</p>
        )}

        {/* Render the active edit form full-width above the grid. */}
        {this.renderActiveEdit()}

        <div className="PointSystemAdmin-decoGrid">
          {this.items.map((it) => this.renderItem(it))}
        </div>
      </div>
    );
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

    const url = this.resolveAsset(deco.attribute('imagePath'));
    const name = deco.attribute('name') ?? '';
    const price = deco.attribute('price') ?? 0;
    const enabled = !!deco.attribute('isEnabled');

    return (
      <div className={`PointSystemAdmin-decoCard ${enabled ? '' : 'is-disabled'}`}>
        <div className="PointSystemAdmin-decoCard-preview">
          {url && <img src={url} alt={name} />}
        </div>
        <div className="PointSystemAdmin-decoCard-meta">
          <strong>{name}</strong>
          <small>{price} pts</small>
        </div>
        <div className="PointSystemAdmin-decoCard-actions">
          <Button className="Button" onclick={() => this.beginEdit(deco)}>
            <i className="fas fa-pen" /> {app.translator.trans('ramon-point-system.admin.edit')}
          </Button>
          <Button className="Button" onclick={() => this.saveField(deco, 'isEnabled', !enabled)}>
            {enabled ? app.translator.trans('ramon-point-system.admin.disable') : app.translator.trans('ramon-point-system.admin.enable')}
          </Button>
          <Button className="Button Button--danger" onclick={() => this.remove(id)}>
            <i className="fas fa-trash" />
          </Button>
        </div>
      </div>
    );
  }

  renderEditForm(deco: any, draft: any) {
    const url = this.resolveAsset(deco.attribute('imagePath'));
    const name = deco.attribute('name') ?? '';

    return (
      <div className="PointSystemAdmin-decoCard PointSystemAdmin-decoCard--editing">
        <div className="PointSystemAdmin-decoCard-preview">
          {url && <img src={url} alt={name} />}
        </div>
        <div className="Form-group">
          <label>{app.translator.trans('ramon-point-system.admin.avatar.field_name')}</label>
          <input
            className="FormControl"
            value={draft.name}
            oninput={(e: Event) => (draft.name = (e.target as HTMLInputElement).value)}
          />
        </div>
        <div className="Form-group">
          <label>{app.translator.trans('ramon-point-system.admin.avatar.field_description')}</label>
          <input
            className="FormControl"
            value={draft.description ?? ''}
            oninput={(e: Event) => (draft.description = (e.target as HTMLInputElement).value)}
          />
        </div>
        <div className="Form-group">
          <label>{app.translator.trans('ramon-point-system.admin.avatar.field_price')}</label>
          <input
            type="number"
            min="0"
            className="FormControl"
            value={draft.price}
            oninput={(e: Event) => (draft.price = Number((e.target as HTMLInputElement).value))}
          />
        </div>
        <div className="Form-group">
          <label>{app.translator.trans('ramon-point-system.admin.avatar.replace_image')}</label>
          <input
            type="file"
            accept="image/png,image/gif,image/webp,image/apng"
            onchange={(e: Event) => (draft.newFile = (e.target as HTMLInputElement).files?.[0] || null)}
          />
          <p className="helpText">{app.translator.trans('ramon-point-system.admin.avatar.field_image_help')}</p>
        </div>
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
      newFile: null,
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
      // Update text fields via the JSON:API model save.
      await deco.save({
        name: draft.name,
        description: draft.description || null,
        price: Number(draft.price) || 0,
      });

      // If a new image was picked, upload it separately via the existing
      // multipart endpoint. We POST to the upload route with the same deco id
      // in the body so the server replaces the file on the existing record.
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

  async upload() {
    if (!this.newFile) return;
    this.uploading = true;
    m.redraw();

    const form = new FormData();
    form.append('image', this.newFile);
    form.append('name', this.newName);
    form.append('description', this.newDescription);
    form.append('price', this.newPrice);

    try {
      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
      await app.request({
        method: 'POST',
        url: `${apiUrl}/point-system/avatar-decoration/upload`,
        serialize: (b: any) => b,
        body: form,
      } as any);
      this.newName = '';
      this.newDescription = '';
      this.newPrice = '100';
      this.newFile = null;
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

  resolveAsset(path: string): string {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    const base =
      (app.forum.attribute('assetsBaseUrl') as string | undefined) ||
      (app.forum.attribute('baseUrl') as string) + '/assets';
    return base.replace(/\/+$/, '') + '/' + String(path).replace(/^\/+/, '');
  }
}
