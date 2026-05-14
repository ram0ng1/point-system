// @ts-nocheck
import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';

/**
 * Admin panel for shop-sold profile covers. Same shape as AvatarDecorationsPanel
 * — animated PNG / GIF / WebP / APNG uploads, name + description + price per
 * cover, enable/disable toggle, replace-image. We deliberately keep the model
 * mirror of avatar decorations because covers are conceptually similar (an
 * image asset with a price). The difference is rendering (full-width banner
 * vs round avatar overlay) which lives in the forum bundle.
 */
export default class CoverDecorationsPanel extends Component {
  loading = true;
  items: any[] = [];
  uploading = false;

  newName = '';
  newDescription = '';
  newPrice = '100';
  newFile: File | null = null;

  edits: Record<string, any> = {};

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
        <div className="PointSystemAdmin-section-header">
          <h2>{t('title')}</h2>
          <p className="helpText">{t('help')}</p>
        </div>

        <div className="PointSystemAdmin-uploader">
          <h3>{t('upload_title')}</h3>
          <div className="Form-group">
            <label>{t('field_name')}</label>
            <input className="FormControl" value={this.newName}
              oninput={(e: Event) => (this.newName = (e.target as HTMLInputElement).value)} />
          </div>
          <div className="Form-group">
            <label>{t('field_description')}</label>
            <input className="FormControl" value={this.newDescription}
              oninput={(e: Event) => (this.newDescription = (e.target as HTMLInputElement).value)} />
          </div>
          <div className="Form-group">
            <label>{t('field_price')}</label>
            <input type="number" min="0" className="FormControl" value={this.newPrice}
              oninput={(e: Event) => (this.newPrice = (e.target as HTMLInputElement).value)} />
          </div>
          <div className="Form-group">
            <label>{t('field_image')}</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/apng"
              onchange={(e: Event) => (this.newFile = (e.target as HTMLInputElement).files?.[0] || null)}
            />
            <p className="helpText">{t('field_image_help')}</p>
          </div>
          <Button
            className="Button Button--primary"
            loading={this.uploading}
            disabled={!this.newFile || !this.newName.trim()}
            onclick={() => this.upload()}
          >
            {t('upload')}
          </Button>
        </div>

        <h3>{t('existing')}</h3>
        {this.items.length === 0 && (
          <p className="PointSystemAdmin-empty">{t('none')}</p>
        )}

        {this.renderActiveEdit()}

        <div className="PointSystemAdmin-coverGrid">
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
    if (this.edits[id]) return null;

    const url = this.resolveAsset(deco.attribute('imagePath'));
    const name = deco.attribute('name') ?? '';
    const price = deco.attribute('price') ?? 0;
    const enabled = !!deco.attribute('isEnabled');
    const t = (k: string) => app.translator.trans('ramon-point-system.admin.' + k);

    return (
      <div className={`PointSystemAdmin-coverCard ${enabled ? '' : 'is-disabled'}`}>
        <div className="PointSystemAdmin-coverCard-preview">
          {url && <img src={url} alt={name} />}
        </div>
        <div className="PointSystemAdmin-coverCard-meta">
          <strong>{name}</strong>
          <small>{price} pts</small>
        </div>
        <div className="PointSystemAdmin-coverCard-actions">
          <Button className="Button" onclick={() => this.beginEdit(deco)}>
            <i className="fas fa-pen" /> {t('edit')}
          </Button>
          <Button className="Button" onclick={() => this.saveField(deco, 'isEnabled', !enabled)}>
            {enabled ? t('disable') : t('enable')}
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
    const t = (k: string) => app.translator.trans('ramon-point-system.admin.' + k);
    const tc = (k: string) => app.translator.trans('ramon-point-system.admin.cover.' + k);

    return (
      <div className="PointSystemAdmin-coverCard PointSystemAdmin-coverCard--editing">
        <div className="PointSystemAdmin-coverCard-preview">
          {url && <img src={url} alt={name} />}
        </div>
        <div className="Form-group">
          <label>{tc('field_name')}</label>
          <input className="FormControl" value={draft.name}
            oninput={(e: Event) => (draft.name = (e.target as HTMLInputElement).value)} />
        </div>
        <div className="Form-group">
          <label>{tc('field_description')}</label>
          <input className="FormControl" value={draft.description ?? ''}
            oninput={(e: Event) => (draft.description = (e.target as HTMLInputElement).value)} />
        </div>
        <div className="Form-group">
          <label>{tc('field_price')}</label>
          <input type="number" min="0" className="FormControl" value={draft.price}
            oninput={(e: Event) => (draft.price = Number((e.target as HTMLInputElement).value))} />
        </div>
        <div className="Form-group">
          <label>{tc('replace_image')}</label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/apng"
            onchange={(e: Event) => (draft.newFile = (e.target as HTMLInputElement).files?.[0] || null)}
          />
          <p className="helpText">{tc('field_image_help')}</p>
        </div>
        <div className="PointSystemAdmin-coverCard-actions">
          <Button className="Button Button--primary" onclick={() => this.commitEdit(deco)}>
            {t('save')}
          </Button>
          <Button className="Button" onclick={() => this.cancelEdit(deco)}>
            {t('cancel')}
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
      await deco.save({
        name: draft.name,
        description: draft.description || null,
        price: Number(draft.price) || 0,
      });

      if (draft.newFile) {
        const form = new FormData();
        form.append('image', draft.newFile);
        form.append('replace_id', String(deco.id()));
        const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
        await app.request({
          method: 'POST',
          url: `${apiUrl}/point-system/cover-decoration/upload`,
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
        url: `${apiUrl}/point-system/cover-decoration/upload`,
        serialize: (b: any) => b,
        body: form,
      } as any);
      this.newName = '';
      this.newDescription = '';
      this.newPrice = '100';
      this.newFile = null;
      await this.load();
      app.alerts.show({ type: 'success' }, app.translator.trans('ramon-point-system.admin.cover.uploaded'));
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
      await app.request({ method: 'DELETE', url: `${apiUrl}/point-system/cover-decoration/${id}` });
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
