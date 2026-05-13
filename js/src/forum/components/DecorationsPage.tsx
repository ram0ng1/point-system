// @ts-nocheck
import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import Button from 'flarum/common/components/Button';
import Avatar from 'flarum/common/components/Avatar';

/**
 * Page that lists what the current user already owns and lets them switch
 * between owned decorations / unequip.
 */
export default class DecorationsPage extends Page {
  // Track which specific row is busy (key = `${type}:${id}` or `${type}:unequip`)
  // so we don't show spinners on every button while one is mid-request.
  busy = new Set<string>();
  busyKey(type: string, id: number | string) { return `${type}:${id}`; }

  oninit(vnode: any) {
    super.oninit(vnode);
    if (!app.session.user) {
      m.route.set('/');
    }
    const title = app.translator.trans('ramon-point-system.forum.my_decorations.title') as string;
    app.history.push('decorations', title);
    app.setTitle(title);
  }

  view() {
    if (!app.session.user) return null;

    const avatars = (app.forum.attribute('pointSystemAvatarDecorations') as any[]) || [];
    const names = (app.forum.attribute('pointSystemNameDecorations') as any[]) || [];
    const owned = (app.session.user.attribute('ownedDecorationIds') as any[]) || [];

    const ownedAvatars = avatars.filter((d) =>
      owned.some((o: any) => o.type === 'avatar_decoration' && Number(o.id) === Number(d.id))
    );
    const ownedNames = names.filter((d) =>
      owned.some((o: any) => o.type === 'name_decoration' && Number(o.id) === Number(d.id))
    );

    const equippedAvatarId = Number(app.session.user.attribute('equippedAvatarDecorationId') ?? 0);
    const equippedNameId = Number(app.session.user.attribute('equippedNameDecorationId') ?? 0);

    const user = app.session.user;
    const equippedNameSlug = String(user.attribute('equippedNameDecorationSlug') || '').replace(/[^a-zA-Z0-9_-]/g, '');

    return (
      <div className="PointSystemDecorations container">
        <h1>{app.translator.trans('ramon-point-system.forum.my_decorations.title')}</h1>

        {/* Live preview — shows the user how they currently appear with both
            decorations equipped. Avatar uses the standard component so our
            Avatar.view extender adds the frame; username uses ps-name-{slug}
            so the global decoration CSS picks it up. */}
        <section className="PointSystemDecorations-preview">
          <h2>{app.translator.trans('ramon-point-system.forum.my_decorations.preview')}</h2>
          <div className="PointSystemDecorations-previewBody">
            <div className="PointSystemDecorations-previewAvatar">
              <Avatar user={user} />
            </div>
            <div className={equippedNameSlug ? `ps-name-${equippedNameSlug}` : ''}>
              <span className="username">{user.username()}</span>
            </div>
          </div>
        </section>

        <section>
          <h2>{app.translator.trans('ramon-point-system.forum.my_decorations.avatar')}</h2>
          {ownedAvatars.length === 0 && (
            <p className="PointSystemDecorations-empty">
              {app.translator.trans('ramon-point-system.forum.my_decorations.none')}
            </p>
          )}
          <div className="PointSystemDecorations-grid">
            {ownedAvatars.map((d) => (
              <div className={`PointSystemDecorations-item ${equippedAvatarId === d.id ? 'is-equipped' : ''}`} key={`av-${d.id}`}>
                <img src={this.resolveAsset(d.imagePath)} alt={d.name} />
                <div className="PointSystemDecorations-item-name">{d.name}</div>
                <div className="PointSystemDecorations-item-actions">
                  {equippedAvatarId === d.id ? (
                    <Button className="Button" loading={this.busy.has(this.busyKey('avatar_decoration', d.id))} onclick={() => this.unequip('avatar_decoration', d.id)}>
                      {app.translator.trans('ramon-point-system.forum.my_decorations.unequip')}
                    </Button>
                  ) : (
                    <Button
                      className="Button Button--primary"
                      loading={this.busy.has(this.busyKey('avatar_decoration', d.id))}
                      onclick={() => this.equip('avatar_decoration', d.id, { equippedAvatarDecorationId: d.id, equippedAvatarDecorationUrl: d.imagePath })}
                    >
                      {app.translator.trans('ramon-point-system.forum.my_decorations.equip')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2>{app.translator.trans('ramon-point-system.forum.my_decorations.name')}</h2>
          {ownedNames.length === 0 && (
            <p className="PointSystemDecorations-empty">
              {app.translator.trans('ramon-point-system.forum.my_decorations.none')}
            </p>
          )}
          <div className="PointSystemDecorations-grid">
            {ownedNames.map((d) => {
              const slug = String(d.slug || '').replace(/[^a-zA-Z0-9_-]/g, '');
              return (
                <div className={`PointSystemDecorations-item ${equippedNameId === d.id ? 'is-equipped' : ''}`} key={`na-${d.id}`}>
                  <span className={`ps-name-preview ps-name-${slug}`}>{app.session.user.username()}</span>
                  <div className="PointSystemDecorations-item-name">{d.name}</div>
                  <div className="PointSystemDecorations-item-actions">
                    {equippedNameId === d.id ? (
                      <Button className="Button" loading={this.busy.has(this.busyKey('name_decoration', d.id))} onclick={() => this.unequip('name_decoration', d.id)}>
                        {app.translator.trans('ramon-point-system.forum.my_decorations.unequip')}
                      </Button>
                    ) : (
                      <Button
                        className="Button Button--primary"
                        loading={this.busy.has(this.busyKey('name_decoration', d.id))}
                        onclick={() => this.equip('name_decoration', d.id, { equippedNameDecorationId: d.id, equippedNameDecorationSlug: d.slug })}
                      >
                        {app.translator.trans('ramon-point-system.forum.my_decorations.equip')}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    );
  }

  async equip(type: string, id: number, optimistic: Record<string, any>) {
    const key = this.busyKey(type, id);
    this.busy.add(key);
    m.redraw();
    try {
      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
      await app.request({ method: 'POST', url: `${apiUrl}/point-system/equip`, body: { type, id } });
      app.session.user.pushAttributes(optimistic);
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Error');
    } finally {
      this.busy.delete(key);
      m.redraw();
    }
  }

  async unequip(type: string, id: number) {
    const key = this.busyKey(type, id);
    this.busy.add(key);
    m.redraw();
    try {
      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
      await app.request({ method: 'POST', url: `${apiUrl}/point-system/unequip`, body: { type } });
      if (type === 'avatar_decoration') {
        app.session.user.pushAttributes({ equippedAvatarDecorationId: null, equippedAvatarDecorationUrl: null });
      } else {
        app.session.user.pushAttributes({ equippedNameDecorationId: null, equippedNameDecorationSlug: null });
      }
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Error');
    } finally {
      this.busy.delete(key);
      m.redraw();
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
