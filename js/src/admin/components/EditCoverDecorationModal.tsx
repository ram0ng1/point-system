// @ts-nocheck
import app from 'flarum/admin/app';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import AvailabilityInputs from './AvailabilityInputs';
import { pointsLabel } from '../../common/utils/pointsLabel';

/**
 * Edit modal for an existing profile cover. Mirrors EditAvatarDecorationModal
 * but uses the cover-decoration upload endpoint and asset path conventions.
 */
export default class EditCoverDecorationModal extends Modal {
  static dismissibleOptions = {
    viaEscKey: true,
    viaCloseButton: true,
    viaBackdropClick: false,
  };

  draft: any = null;
  saving = false;

  oninit(vnode: any) {
    super.oninit(vnode);
    const deco = this.attrs.deco;
    this.draft = {
      name: deco.attribute('name') || '',
      description: deco.attribute('description') || '',
      price: deco.attribute('price') || 0,
      imageUrl: deco.attribute('imageUrl') || '',
      newFile: null as File | null,
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

  className() {
    return 'EditDecorationModal Modal--medium';
  }

  title() {
    return app.translator.trans('ramon-point-system.admin.cover.edit_title', {
      name: this.attrs.deco.attribute('name') || '',
    });
  }

  content() {
    const deco = this.attrs.deco;
    const draft = this.draft;
    const url = this.previewUrl(deco);
    const name = deco.attribute('name') ?? '';
    const t = (k: string) => app.translator.trans('ramon-point-system.admin.cover.' + k);
    const ta = (k: string) => app.translator.trans('ramon-point-system.admin.avatar.' + k);

    return (
      <div className="Modal-body">
        <div className="PointSystemAdmin-coverCard-preview">{url && <img src={url} alt={name} />}</div>
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
          <label>
            {t('field_price')} ({pointsLabel(app)})
          </label>
          <input
            type="number"
            min="0"
            className="FormControl"
            value={draft.price}
            oninput={(e: Event) => (draft.price = Number((e.target as HTMLInputElement).value))}
          />
        </div>
        <div className="Form-group">
          <label>{ta('field_image_url')}</label>
          <input
            type="url"
            className="FormControl"
            placeholder="https://example.com/cover.jpg"
            value={draft.imageUrl ?? ''}
            oninput={(e: Event) => (draft.imageUrl = (e.target as HTMLInputElement).value)}
          />
          <p className="helpText">{ta('field_image_url_help')}</p>
        </div>
        <div className="Form-group">
          <label>{t('replace_image')}</label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/apng"
            onchange={(e: Event) => (draft.newFile = (e.target as HTMLInputElement).files?.[0] || null)}
          />
          <p className="helpText">{t('field_image_help')}</p>
        </div>

        <AvailabilityInputs state={draft.availability} onchange={(s: any) => (draft.availability = s)} />

        <div className="Form-group EditDecorationModal-actions">
          <Button className="Button Button--primary" loading={this.saving} disabled={this.saving} onclick={() => this.commit()}>
            <i className="fas fa-save" /> {app.translator.trans('ramon-point-system.admin.save')}
          </Button>
          <Button className="Button" disabled={this.saving} onclick={() => this.hide()}>
            {app.translator.trans('ramon-point-system.admin.cancel')}
          </Button>
        </div>
      </div>
    );
  }

  async commit() {
    const deco = this.attrs.deco;
    const draft = this.draft;
    this.saving = true;
    m.redraw();
    try {
      const av = draft.availability || {};
      await deco.save({
        name: draft.name,
        description: draft.description || null,
        price: Number(draft.price) || 0,
        imageUrl: draft.imageUrl ? draft.imageUrl : null,
        maxClaims: av.maxClaims,
        availableFrom: av.availableFrom || null,
        availableUntil: av.availableUntil || null,
        isListed: !!av.isListed,
        allowedGroupIds: Array.isArray(av.allowedGroupIds) ? av.allowedGroupIds : [],
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

      if (this.attrs.onSaved) this.attrs.onSaved();
      this.hide();
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Failed');
    } finally {
      this.saving = false;
      m.redraw();
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
