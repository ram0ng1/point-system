// @ts-nocheck
import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import Button from 'flarum/common/components/Button';
import LinkButton from 'flarum/common/components/LinkButton';
import Avatar from 'flarum/common/components/Avatar';
import SelectDropdown from 'flarum/common/components/SelectDropdown';

type DecorationsTab = 'avatar' | 'name' | 'cover' | 'title' | 'post-hl';

/**
 * Page that lists what the current user already owns and lets them switch
 * between owned decorations / unequip.
 */
export default class DecorationsPage extends Page {
  // Active section is derived from the route param `tab` so each section has
  // its own URL (/decorations/name, /decorations/cover). The bare path falls
  // back to 'avatar'.
  get tab(): DecorationsTab {
    const raw = m.route.param('tab');
    const valid: DecorationsTab[] = ['avatar', 'name', 'cover', 'title', 'post-hl'];
    return (valid as string[]).includes(raw) ? (raw as DecorationsTab) : 'avatar';
  }

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
    const covers = (app.forum.attribute('pointSystemCoverDecorations') as any[]) || [];
    const titles = (app.forum.attribute('pointSystemTitleDecorations') as any[]) || [];
    const postHls = (app.forum.attribute('pointSystemPostHighlightDecorations') as any[]) || [];
    const owned = (app.session.user.attribute('ownedDecorationIds') as any[]) || [];

    const ownedOf = (type: string, source: any[]) =>
      source.filter((d) => owned.some((o: any) => o.type === type && Number(o.id) === Number(d.id)));

    const ownedAvatars = ownedOf('avatar_decoration', avatars);
    const ownedNames   = ownedOf('name_decoration', names);
    const ownedCovers  = ownedOf('cover_decoration', covers);
    const ownedTitles  = ownedOf('title_decoration', titles);
    const ownedPostHls = ownedOf('post_highlight_decoration', postHls);

    const equippedAvatarId  = Number(app.session.user.attribute('equippedAvatarDecorationId') ?? 0);
    const equippedNameId    = Number(app.session.user.attribute('equippedNameDecorationId') ?? 0);
    const equippedCoverId   = Number(app.session.user.attribute('equippedCoverDecorationId') ?? 0);
    const equippedTitleId   = Number(app.session.user.attribute('equippedTitleDecorationId') ?? 0);
    const equippedPostHlId  = Number(app.session.user.attribute('equippedPostHighlightDecorationId') ?? 0);

    const user = app.session.user;
    const equippedNameSlug = String(user.attribute('equippedNameDecorationSlug') || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const coverEnabled  = app.forum.attribute('pointSystem.cover_deco_enabled') !== false;
    const titleEnabled  = app.forum.attribute('pointSystem.title_deco_enabled') !== false;
    const postHlEnabled = app.forum.attribute('pointSystem.post_hl_deco_enabled') !== false;

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

        <nav className="PointSystemDecorations-nav">
          <SelectDropdown
            className="PointSystemDecorations-nav-select App-titleControl"
            buttonClassName="Button"
            accessibleToggleLabel={app.translator.trans('ramon-point-system.forum.my_decorations.toggle_nav_label')}
          >
            {this.navItems(coverEnabled, titleEnabled, postHlEnabled)}
          </SelectDropdown>
        </nav>

        {this.tab === 'avatar' && (
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
        )}

        {this.tab === 'name' && (
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
        )}

        {this.tab === 'title' && titleEnabled && (
          <section>
            <h2>{app.translator.trans('ramon-point-system.forum.my_decorations.custom_title')}</h2>
            {ownedTitles.length === 0 && (
              <p className="PointSystemDecorations-empty">
                {app.translator.trans('ramon-point-system.forum.my_decorations.none')}
              </p>
            )}
            <div className="PointSystemDecorations-grid">
              {ownedTitles.map((d) => {
                const slug = String(d.slug || '').replace(/[^a-zA-Z0-9_-]/g, '');
                const isEq = equippedTitleId === d.id;
                const styleVar = d.color ? `--ps-title-color:${String(d.color).replace(/[<>"';]/g, '')};` : '';
                return (
                  <div className={`PointSystemDecorations-item ${isEq ? 'is-equipped' : ''}`} key={`ti-${d.id}`}>
                    <span className={`ps-title-preview ps-title-${slug}`} style={styleVar}>{d.titleText}</span>
                    <div className="PointSystemDecorations-item-name">{d.name}</div>
                    <div className="PointSystemDecorations-item-actions">
                      {isEq ? (
                        <Button className="Button" loading={this.busy.has(this.busyKey('title_decoration', d.id))} onclick={() => this.unequip('title_decoration', d.id)}>
                          {app.translator.trans('ramon-point-system.forum.my_decorations.unequip')}
                        </Button>
                      ) : (
                        <Button
                          className="Button Button--primary"
                          loading={this.busy.has(this.busyKey('title_decoration', d.id))}
                          onclick={() => this.equip('title_decoration', d.id, {
                            equippedTitleDecorationId: d.id,
                            equippedTitleDecorationSlug: d.slug,
                            equippedTitleDecorationText: d.titleText,
                          })}
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
        )}

        {this.tab === 'post-hl' && postHlEnabled && (
          <section>
            <h2>{app.translator.trans('ramon-point-system.forum.my_decorations.post_hl')}</h2>
            {ownedPostHls.length === 0 && (
              <p className="PointSystemDecorations-empty">
                {app.translator.trans('ramon-point-system.forum.my_decorations.none')}
              </p>
            )}
            <div className="PointSystemDecorations-grid">
              {ownedPostHls.map((d) => {
                const slug = String(d.slug || '').replace(/[^a-zA-Z0-9_-]/g, '');
                const isEq = equippedPostHlId === d.id;
                return (
                  <div className={`PointSystemDecorations-item ${isEq ? 'is-equipped' : ''}`} key={`ph-${d.id}`}>
                    <div className={`ps-posthl-preview ps-posthl-${slug}`}>
                      <div className="ps-posthl-preview-avatar" />
                      <div className="ps-posthl-preview-body">
                        <div className="ps-posthl-preview-line" />
                        <div className="ps-posthl-preview-line short" />
                      </div>
                    </div>
                    <div className="PointSystemDecorations-item-name">{d.name}</div>
                    <div className="PointSystemDecorations-item-actions">
                      {isEq ? (
                        <Button className="Button" loading={this.busy.has(this.busyKey('post_highlight_decoration', d.id))} onclick={() => this.unequip('post_highlight_decoration', d.id)}>
                          {app.translator.trans('ramon-point-system.forum.my_decorations.unequip')}
                        </Button>
                      ) : (
                        <Button
                          className="Button Button--primary"
                          loading={this.busy.has(this.busyKey('post_highlight_decoration', d.id))}
                          onclick={() => this.equip('post_highlight_decoration', d.id, {
                            equippedPostHighlightDecorationId: d.id,
                            equippedPostHighlightDecorationSlug: d.slug,
                          })}
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
        )}

        {this.tab === 'cover' && coverEnabled && (
          <section>
            <h2>{app.translator.trans('ramon-point-system.forum.my_decorations.cover')}</h2>
            {ownedCovers.length === 0 && (
              <p className="PointSystemDecorations-empty">
                {app.translator.trans('ramon-point-system.forum.my_decorations.none')}
              </p>
            )}
            <div className="PointSystemDecorations-coverGrid">
              {ownedCovers.map((d) => (
                <div className={`PointSystemDecorations-coverItem ${equippedCoverId === d.id ? 'is-equipped' : ''}`} key={`co-${d.id}`}>
                  <div className="PointSystemDecorations-coverItem-preview">
                    <img src={this.resolveAsset(d.imagePath)} alt={d.name} />
                  </div>
                  <div className="PointSystemDecorations-item-name">{d.name}</div>
                  <div className="PointSystemDecorations-item-actions">
                    {equippedCoverId === d.id ? (
                      <Button className="Button" loading={this.busy.has(this.busyKey('cover_decoration', d.id))} onclick={() => this.unequip('cover_decoration', d.id)}>
                        {app.translator.trans('ramon-point-system.forum.my_decorations.unequip')}
                      </Button>
                    ) : (
                      <Button
                        className="Button Button--primary"
                        loading={this.busy.has(this.busyKey('cover_decoration', d.id))}
                        onclick={() => this.equip('cover_decoration', d.id, { equippedCoverDecorationId: d.id, equippedCoverDecorationUrl: d.imagePath })}
                      >
                        {app.translator.trans('ramon-point-system.forum.my_decorations.equip')}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  navItems(coverEnabled: boolean, titleEnabled: boolean, postHlEnabled: boolean) {
    // See ShopPage.navItems for the bind() rationale.
    const t = app.translator.trans.bind(app.translator);
    const current = this.tab;

    const item = (id: DecorationsTab, icon: string, label: string) => {
      const isActive = current === id;
      const href = app.route('pointSystem.decorations.tab', { tab: id });
      return (
        <LinkButton
          className="Button Button--link"
          icon={icon}
          href={href}
          active={isActive}
          itemClassName={isActive ? 'active' : ''}
        >
          {label}
        </LinkButton>
      );
    };

    return [
      item('avatar', 'fas fa-user-circle', t('ramon-point-system.forum.my_decorations.avatar') as string),
      item('name', 'fas fa-font', t('ramon-point-system.forum.my_decorations.name') as string),
      coverEnabled  ? item('cover', 'fas fa-image', t('ramon-point-system.forum.my_decorations.cover') as string) : null,
      titleEnabled  ? item('title', 'fas fa-id-badge', t('ramon-point-system.forum.my_decorations.custom_title') as string) : null,
      postHlEnabled ? item('post-hl', 'fas fa-highlighter', t('ramon-point-system.forum.my_decorations.post_hl') as string) : null,
    ];
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
      } else if (type === 'cover_decoration') {
        app.session.user.pushAttributes({ equippedCoverDecorationId: null, equippedCoverDecorationUrl: null });
      } else if (type === 'title_decoration') {
        app.session.user.pushAttributes({ equippedTitleDecorationId: null, equippedTitleDecorationSlug: null, equippedTitleDecorationText: null });
      } else if (type === 'post_highlight_decoration') {
        app.session.user.pushAttributes({ equippedPostHighlightDecorationId: null, equippedPostHighlightDecorationSlug: null });
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
