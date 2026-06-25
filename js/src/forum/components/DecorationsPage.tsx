// @ts-nocheck
import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import Button from 'flarum/common/components/Button';
import LinkButton from 'flarum/common/components/LinkButton';
import Avatar from 'flarum/common/components/Avatar';
import SelectDropdown from 'flarum/common/components/SelectDropdown';
import SubmitDecorationModal from './SubmitDecorationModal';
import { pointsLabel } from '../../common/utils/pointsLabel';
import { safeCssUrl } from '../../common/utils/safeCssUrl';

type DecorationsTab = 'all' | 'avatar' | 'name' | 'cover' | 'title' | 'post-hl';

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
    const valid: DecorationsTab[] = ['all', 'avatar', 'name', 'cover', 'title', 'post-hl'];
    if ((valid as string[]).includes(raw)) {
      // Reject a tab whose master toggle is off — the section won't
      // render anyway and the user would see an empty page. Fall
      // through to 'all' so they at least see what they own.
      const attr = (k: string) => app.forum.attribute(k) !== false;
      const enabledKey = {
        avatar: 'pointSystem.avatar_deco_enabled',
        name: 'pointSystem.name_deco_enabled',
        cover: 'pointSystem.cover_deco_enabled',
        title: 'pointSystem.title_deco_enabled',
        'post-hl': 'pointSystem.post_hl_deco_enabled',
        all: null,
      }[raw as string];
      if (!enabledKey || attr(enabledKey)) return raw as DecorationsTab;
    }
    return 'all';
  }

  // Track which specific row is busy (key = `${type}:${id}` or `${type}:unequip`)
  // so we don't show spinners on every button while one is mid-request.
  busy = new Set<string>();
  busyKey(type: string, id: number | string) {
    return `${type}:${id}`;
  }

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

    // Attach `_quantity` from the owned array so the render layer can show
    // a stack-count badge (×N) without a second lookup. Claims are now
    // stackable — a user may own multiple copies of the same decoration
    // via repeat shop purchases, admin grants, or accumulated trades.
    const ownedOf = (type: string, source: any[]) =>
      source
        .filter((d) => owned.some((o: any) => o.type === type && Number(o.id) === Number(d.id)))
        .map((d) => {
          const o = owned.find((o: any) => o.type === type && Number(o.id) === Number(d.id));
          return { ...d, _quantity: Math.max(1, Number(o?.quantity ?? 1)) };
        });

    const ownedAvatars = ownedOf('avatar_decoration', avatars);
    const ownedNames = ownedOf('name_decoration', names);
    const ownedCovers = ownedOf('cover_decoration', covers);
    const ownedTitles = ownedOf('title_decoration', titles);
    const ownedPostHls = ownedOf('post_highlight_decoration', postHls);

    const equippedAvatarId = Number(app.session.user.attribute('equippedAvatarDecorationId') ?? 0);
    const equippedNameId = Number(app.session.user.attribute('equippedNameDecorationId') ?? 0);
    const equippedCoverId = Number(app.session.user.attribute('equippedCoverDecorationId') ?? 0);
    const equippedTitleId = Number(app.session.user.attribute('equippedTitleDecorationId') ?? 0);
    const equippedPostHlId = Number(app.session.user.attribute('equippedPostHighlightDecorationId') ?? 0);

    const user = app.session.user;
    const equippedNameSlug = String(user.attribute('equippedNameDecorationSlug') || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const avatarEnabled = app.forum.attribute('pointSystem.avatar_deco_enabled') !== false;
    const nameEnabled = app.forum.attribute('pointSystem.name_deco_enabled') !== false;
    const coverEnabled = app.forum.attribute('pointSystem.cover_deco_enabled') !== false;
    const titleEnabled = app.forum.attribute('pointSystem.title_deco_enabled') !== false;
    const postHlEnabled = app.forum.attribute('pointSystem.post_hl_deco_enabled') !== false;

    const submitType = this.currentSubmitType();
    const userSubmissionsEnabled =
      app.forum.attribute('pointSystemUserSubmissionsEnabled') !== false && app.forum.attribute('pointSystemUserSubmissionsEnabled') !== undefined;
    const canSubmit = userSubmissionsEnabled && submitType !== null;

    return (
      <div className="PointSystemDecorations container">
        <div className="PointSystemDecorations-pageHeader">
          <h1>{app.translator.trans('ramon-point-system.forum.my_decorations.title')}</h1>
          <div className="PointSystemDecorations-pageHeader-actions">
            {/* Back to the Rewards shop. The shop links here ("My decorations")
                but the trip was one-way — users landed on this page with no
                in-page way back. A back arrow makes it a clear "voltar"
                affordance. Gated on the same view-shop permission so it never
                points at a 404 for users who can't reach the shop. */}
            {app.forum.attribute('pointSystemCanViewShop') && (
              <LinkButton href={app.route('pointSystem.shop')} icon="fas fa-arrow-left" className="Button Button--link PointSystemDecorations-back">
                {app.translator.trans('ramon-point-system.forum.my_decorations.back_to_shop')}
              </LinkButton>
            )}
            {canSubmit && (
              <Button
                className="Button Button--primary"
                onclick={() => app.modal.show(SubmitDecorationModal, { type: submitType, onSubmitted: () => m.redraw() })}
              >
                <i className="fas fa-paper-plane" /> {app.translator.trans('ramon-point-system.forum.my_decorations.submit_cta')}
              </Button>
            )}
          </div>
        </div>

        {/* Live preview — mirrors the user-profile hero so users see exactly
            how their equipped decorations render on their own page (Avocado /
            Flarum UserPage Hero look). The wrapper carries `.UserHero` so
            our cover-decoration CSS rule (`background-image: var(--ps-cover-url)`)
            paints the banner; Avatar inherits our `applyAvatarDecoration`
            view extender for the frame overlay; the name span carries
            `ps-name-{slug}` so the runtime style block paints it; the title
            chip uses the same component the post header renders. */}
        {this.renderLivePreview(user, equippedNameSlug)}

        <nav className="PointSystemDecorations-nav App-titleControl">
          <SelectDropdown
            className="PointSystemDecorations-nav-select"
            buttonClassName="Button"
            accessibleToggleLabel={app.translator.trans('ramon-point-system.forum.my_decorations.toggle_nav_label')}
          >
            {this.navItems(avatarEnabled, nameEnabled, coverEnabled, titleEnabled, postHlEnabled)}
          </SelectDropdown>
        </nav>

        {this.tab === 'all' && (
          <section>
            <h2>{app.translator.trans('ramon-point-system.forum.my_decorations.tab_all')}</h2>
            {ownedAvatars.length + ownedNames.length + ownedCovers.length + ownedTitles.length + ownedPostHls.length === 0 && (
              <p className="PointSystemDecorations-empty">{app.translator.trans('ramon-point-system.forum.my_decorations.none')}</p>
            )}

            {ownedAvatars.length > 0 && avatarEnabled && (
              <div className="PointSystemDecorations-allGroup">
                <h3>{app.translator.trans('ramon-point-system.forum.my_decorations.avatar')}</h3>
                <div className="PointSystemDecorations-grid">
                  {ownedAvatars.map((d) => (
                    <div className={`PointSystemDecorations-item ${equippedAvatarId === d.id ? 'is-equipped' : ''}`} key={`all-av-${d.id}`}>
                      {this.avatarPreview(d)}
                      <div className="PointSystemDecorations-item-name">
                        {d.name}
                        {d._quantity > 1 && <span className="PointSystemDecorations-item-quantity">×{d._quantity}</span>}
                      </div>
                      <div className="PointSystemDecorations-item-actions">
                        {equippedAvatarId === d.id ? (
                          <Button
                            className="Button"
                            loading={this.busy.has(this.busyKey('avatar_decoration', d.id))}
                            onclick={() => this.unequip('avatar_decoration', d.id)}
                          >
                            {app.translator.trans('ramon-point-system.forum.my_decorations.unequip')}
                          </Button>
                        ) : (
                          <Button
                            className="Button Button--primary"
                            loading={this.busy.has(this.busyKey('avatar_decoration', d.id))}
                            onclick={() =>
                              this.equip('avatar_decoration', d.id, {
                                equippedAvatarDecorationId: d.id,
                                equippedAvatarDecorationUrl: d.imageUrl || d.imagePath,
                              })
                            }
                          >
                            {app.translator.trans('ramon-point-system.forum.my_decorations.equip')}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {ownedNames.length > 0 && nameEnabled && (
              <div className="PointSystemDecorations-allGroup">
                <h3>{app.translator.trans('ramon-point-system.forum.my_decorations.name')}</h3>
                <div className="PointSystemDecorations-grid">
                  {ownedNames.map((d) => {
                    const slug = String(d.slug || '').replace(/[^a-zA-Z0-9_-]/g, '');
                    return (
                      <div className={`PointSystemDecorations-item ${equippedNameId === d.id ? 'is-equipped' : ''}`} key={`all-na-${d.id}`}>
                        <span className={`ps-name-preview ps-name-${slug}`}>{app.session.user.username()}</span>
                        <div className="PointSystemDecorations-item-name">
                          {d.name}
                          {d._quantity > 1 && <span className="PointSystemDecorations-item-quantity">×{d._quantity}</span>}
                        </div>
                        <div className="PointSystemDecorations-item-actions">
                          {equippedNameId === d.id ? (
                            <Button
                              className="Button"
                              loading={this.busy.has(this.busyKey('name_decoration', d.id))}
                              onclick={() => this.unequip('name_decoration', d.id)}
                            >
                              {app.translator.trans('ramon-point-system.forum.my_decorations.unequip')}
                            </Button>
                          ) : (
                            <Button
                              className="Button Button--primary"
                              loading={this.busy.has(this.busyKey('name_decoration', d.id))}
                              onclick={() =>
                                this.equip('name_decoration', d.id, { equippedNameDecorationId: d.id, equippedNameDecorationSlug: d.slug })
                              }
                            >
                              {app.translator.trans('ramon-point-system.forum.my_decorations.equip')}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {ownedCovers.length > 0 && coverEnabled && (
              <div className="PointSystemDecorations-allGroup">
                <h3>{app.translator.trans('ramon-point-system.forum.my_decorations.cover')}</h3>
                <div className="PointSystemDecorations-coverGrid">
                  {ownedCovers.map((d) => (
                    <div className={`PointSystemDecorations-coverItem ${equippedCoverId === d.id ? 'is-equipped' : ''}`} key={`all-co-${d.id}`}>
                      <div className="PointSystemDecorations-coverItem-preview">
                        <img src={this.resolveAsset(d.imagePath || d.imageUrl)} alt={d.name} />
                      </div>
                      <div className="PointSystemDecorations-item-name">
                        {d.name}
                        {d._quantity > 1 && <span className="PointSystemDecorations-item-quantity">×{d._quantity}</span>}
                      </div>
                      <div className="PointSystemDecorations-item-actions">
                        {equippedCoverId === d.id ? (
                          <Button
                            className="Button"
                            loading={this.busy.has(this.busyKey('cover_decoration', d.id))}
                            onclick={() => this.unequip('cover_decoration', d.id)}
                          >
                            {app.translator.trans('ramon-point-system.forum.my_decorations.unequip')}
                          </Button>
                        ) : (
                          <Button
                            className="Button Button--primary"
                            loading={this.busy.has(this.busyKey('cover_decoration', d.id))}
                            onclick={() =>
                              this.equip('cover_decoration', d.id, {
                                equippedCoverDecorationId: d.id,
                                equippedCoverDecorationUrl: d.imageUrl || d.imagePath,
                              })
                            }
                          >
                            {app.translator.trans('ramon-point-system.forum.my_decorations.equip')}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {ownedTitles.length > 0 && titleEnabled && (
              <div className="PointSystemDecorations-allGroup">
                <h3>{app.translator.trans('ramon-point-system.forum.my_decorations.custom_title')}</h3>
                <div className="PointSystemDecorations-grid">
                  {ownedTitles.map((d) => {
                    const slug = String(d.slug || '').replace(/[^a-zA-Z0-9_-]/g, '');
                    const isEq = equippedTitleId === d.id;
                    const styleVar = d.color ? `--ps-title-color:${String(d.color).replace(/[<>"';]/g, '')};` : '';
                    return (
                      <div className={`PointSystemDecorations-item ${isEq ? 'is-equipped' : ''}`} key={`all-ti-${d.id}`}>
                        <span className={`ps-title-preview ps-title-${slug}`} style={styleVar}>
                          {d.titleText}
                        </span>
                        <div className="PointSystemDecorations-item-name">
                          {d.name}
                          {d._quantity > 1 && <span className="PointSystemDecorations-item-quantity">×{d._quantity}</span>}
                        </div>
                        <div className="PointSystemDecorations-item-actions">
                          {isEq ? (
                            <Button
                              className="Button"
                              loading={this.busy.has(this.busyKey('title_decoration', d.id))}
                              onclick={() => this.unequip('title_decoration', d.id)}
                            >
                              {app.translator.trans('ramon-point-system.forum.my_decorations.unequip')}
                            </Button>
                          ) : (
                            <Button
                              className="Button Button--primary"
                              loading={this.busy.has(this.busyKey('title_decoration', d.id))}
                              onclick={() =>
                                this.equip('title_decoration', d.id, {
                                  equippedTitleDecorationId: d.id,
                                  equippedTitleDecorationSlug: d.slug,
                                  equippedTitleDecorationText: d.titleText,
                                })
                              }
                            >
                              {app.translator.trans('ramon-point-system.forum.my_decorations.equip')}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {ownedPostHls.length > 0 && postHlEnabled && (
              <div className="PointSystemDecorations-allGroup">
                <h3>{app.translator.trans('ramon-point-system.forum.my_decorations.post_hl')}</h3>
                <div className="PointSystemDecorations-grid">
                  {ownedPostHls.map((d) => {
                    const slug = String(d.slug || '').replace(/[^a-zA-Z0-9_-]/g, '');
                    const isEq = equippedPostHlId === d.id;
                    return (
                      <div className={`PointSystemDecorations-item ${isEq ? 'is-equipped' : ''}`} key={`all-ph-${d.id}`}>
                        <div className={`ps-posthl-preview ps-posthl-${slug}`}>
                          <div className="ps-posthl-preview-avatar" />
                          <div className="ps-posthl-preview-body">
                            <div className="ps-posthl-preview-line" />
                            <div className="ps-posthl-preview-line short" />
                          </div>
                        </div>
                        <div className="PointSystemDecorations-item-name">
                          {d.name}
                          {d._quantity > 1 && <span className="PointSystemDecorations-item-quantity">×{d._quantity}</span>}
                        </div>
                        <div className="PointSystemDecorations-item-actions">
                          {isEq ? (
                            <Button
                              className="Button"
                              loading={this.busy.has(this.busyKey('post_highlight_decoration', d.id))}
                              onclick={() => this.unequip('post_highlight_decoration', d.id)}
                            >
                              {app.translator.trans('ramon-point-system.forum.my_decorations.unequip')}
                            </Button>
                          ) : (
                            <Button
                              className="Button Button--primary"
                              loading={this.busy.has(this.busyKey('post_highlight_decoration', d.id))}
                              onclick={() =>
                                this.equip('post_highlight_decoration', d.id, {
                                  equippedPostHighlightDecorationId: d.id,
                                  equippedPostHighlightDecorationSlug: d.slug,
                                })
                              }
                            >
                              {app.translator.trans('ramon-point-system.forum.my_decorations.equip')}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {this.tab === 'avatar' && avatarEnabled && (
          <section>
            <h2>{app.translator.trans('ramon-point-system.forum.my_decorations.avatar')}</h2>
            {ownedAvatars.length === 0 && (
              <p className="PointSystemDecorations-empty">{app.translator.trans('ramon-point-system.forum.my_decorations.none')}</p>
            )}
            <div className="PointSystemDecorations-grid">
              {ownedAvatars.map((d) => (
                <div className={`PointSystemDecorations-item ${equippedAvatarId === d.id ? 'is-equipped' : ''}`} key={`av-${d.id}`}>
                  {this.avatarPreview(d)}
                  <div className="PointSystemDecorations-item-name">
                    {d.name}
                    {d._quantity > 1 && <span className="PointSystemDecorations-item-quantity">×{d._quantity}</span>}
                  </div>
                  <div className="PointSystemDecorations-item-actions">
                    {equippedAvatarId === d.id ? (
                      <Button
                        className="Button"
                        loading={this.busy.has(this.busyKey('avatar_decoration', d.id))}
                        onclick={() => this.unequip('avatar_decoration', d.id)}
                      >
                        {app.translator.trans('ramon-point-system.forum.my_decorations.unequip')}
                      </Button>
                    ) : (
                      <Button
                        className="Button Button--primary"
                        loading={this.busy.has(this.busyKey('avatar_decoration', d.id))}
                        onclick={() =>
                          this.equip('avatar_decoration', d.id, {
                            equippedAvatarDecorationId: d.id,
                            equippedAvatarDecorationUrl: d.imageUrl || d.imagePath,
                          })
                        }
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

        {this.tab === 'name' && nameEnabled && (
          <section>
            <h2>{app.translator.trans('ramon-point-system.forum.my_decorations.name')}</h2>
            {ownedNames.length === 0 && (
              <p className="PointSystemDecorations-empty">{app.translator.trans('ramon-point-system.forum.my_decorations.none')}</p>
            )}
            <div className="PointSystemDecorations-grid">
              {ownedNames.map((d) => {
                const slug = String(d.slug || '').replace(/[^a-zA-Z0-9_-]/g, '');
                return (
                  <div className={`PointSystemDecorations-item ${equippedNameId === d.id ? 'is-equipped' : ''}`} key={`na-${d.id}`}>
                    <span className={`ps-name-preview ps-name-${slug}`}>{app.session.user.username()}</span>
                    <div className="PointSystemDecorations-item-name">
                      {d.name}
                      {d._quantity > 1 && <span className="PointSystemDecorations-item-quantity">×{d._quantity}</span>}
                    </div>
                    <div className="PointSystemDecorations-item-actions">
                      {equippedNameId === d.id ? (
                        <Button
                          className="Button"
                          loading={this.busy.has(this.busyKey('name_decoration', d.id))}
                          onclick={() => this.unequip('name_decoration', d.id)}
                        >
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
              <p className="PointSystemDecorations-empty">{app.translator.trans('ramon-point-system.forum.my_decorations.none')}</p>
            )}
            <div className="PointSystemDecorations-grid">
              {ownedTitles.map((d) => {
                const slug = String(d.slug || '').replace(/[^a-zA-Z0-9_-]/g, '');
                const isEq = equippedTitleId === d.id;
                const styleVar = d.color ? `--ps-title-color:${String(d.color).replace(/[<>"';]/g, '')};` : '';
                return (
                  <div className={`PointSystemDecorations-item ${isEq ? 'is-equipped' : ''}`} key={`ti-${d.id}`}>
                    <span className={`ps-title-preview ps-title-${slug}`} style={styleVar}>
                      {d.titleText}
                    </span>
                    <div className="PointSystemDecorations-item-name">
                      {d.name}
                      {d._quantity > 1 && <span className="PointSystemDecorations-item-quantity">×{d._quantity}</span>}
                    </div>
                    <div className="PointSystemDecorations-item-actions">
                      {isEq ? (
                        <Button
                          className="Button"
                          loading={this.busy.has(this.busyKey('title_decoration', d.id))}
                          onclick={() => this.unequip('title_decoration', d.id)}
                        >
                          {app.translator.trans('ramon-point-system.forum.my_decorations.unequip')}
                        </Button>
                      ) : (
                        <Button
                          className="Button Button--primary"
                          loading={this.busy.has(this.busyKey('title_decoration', d.id))}
                          onclick={() =>
                            this.equip('title_decoration', d.id, {
                              equippedTitleDecorationId: d.id,
                              equippedTitleDecorationSlug: d.slug,
                              equippedTitleDecorationText: d.titleText,
                            })
                          }
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
              <p className="PointSystemDecorations-empty">{app.translator.trans('ramon-point-system.forum.my_decorations.none')}</p>
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
                    <div className="PointSystemDecorations-item-name">
                      {d.name}
                      {d._quantity > 1 && <span className="PointSystemDecorations-item-quantity">×{d._quantity}</span>}
                    </div>
                    <div className="PointSystemDecorations-item-actions">
                      {isEq ? (
                        <Button
                          className="Button"
                          loading={this.busy.has(this.busyKey('post_highlight_decoration', d.id))}
                          onclick={() => this.unequip('post_highlight_decoration', d.id)}
                        >
                          {app.translator.trans('ramon-point-system.forum.my_decorations.unequip')}
                        </Button>
                      ) : (
                        <Button
                          className="Button Button--primary"
                          loading={this.busy.has(this.busyKey('post_highlight_decoration', d.id))}
                          onclick={() =>
                            this.equip('post_highlight_decoration', d.id, {
                              equippedPostHighlightDecorationId: d.id,
                              equippedPostHighlightDecorationSlug: d.slug,
                            })
                          }
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
              <p className="PointSystemDecorations-empty">{app.translator.trans('ramon-point-system.forum.my_decorations.none')}</p>
            )}
            <div className="PointSystemDecorations-coverGrid">
              {ownedCovers.map((d) => (
                <div className={`PointSystemDecorations-coverItem ${equippedCoverId === d.id ? 'is-equipped' : ''}`} key={`co-${d.id}`}>
                  <div className="PointSystemDecorations-coverItem-preview">
                    <img src={this.resolveAsset(d.imageUrl || d.imagePath)} alt={d.name} />
                  </div>
                  <div className="PointSystemDecorations-item-name">
                    {d.name}
                    {d._quantity > 1 && <span className="PointSystemDecorations-item-quantity">×{d._quantity}</span>}
                  </div>
                  <div className="PointSystemDecorations-item-actions">
                    {equippedCoverId === d.id ? (
                      <Button
                        className="Button"
                        loading={this.busy.has(this.busyKey('cover_decoration', d.id))}
                        onclick={() => this.unequip('cover_decoration', d.id)}
                      >
                        {app.translator.trans('ramon-point-system.forum.my_decorations.unequip')}
                      </Button>
                    ) : (
                      <Button
                        className="Button Button--primary"
                        loading={this.busy.has(this.busyKey('cover_decoration', d.id))}
                        onclick={() =>
                          this.equip('cover_decoration', d.id, {
                            equippedCoverDecorationId: d.id,
                            equippedCoverDecorationUrl: d.imageUrl || d.imagePath,
                          })
                        }
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

  navItems(avatarEnabled: boolean, nameEnabled: boolean, coverEnabled: boolean, titleEnabled: boolean, postHlEnabled: boolean) {
    // See ShopPage.navItems for the bind() rationale.
    const t = app.translator.trans.bind(app.translator);
    const current = this.tab;

    const item = (id: DecorationsTab, icon: string, label: string) => {
      const isActive = current === id;
      const href = app.route('pointSystem.decorations.tab', { tab: id });
      return (
        <LinkButton className="Button Button--link" icon={icon} href={href} active={isActive} itemClassName={isActive ? 'active' : ''}>
          {label}
        </LinkButton>
      );
    };

    return [
      item('all', 'fas fa-th-large', t('ramon-point-system.forum.my_decorations.tab_all') as string),
      avatarEnabled ? item('avatar', 'fas fa-user-circle', t('ramon-point-system.forum.my_decorations.avatar') as string) : null,
      nameEnabled ? item('name', 'fas fa-font', t('ramon-point-system.forum.my_decorations.name') as string) : null,
      coverEnabled ? item('cover', 'fas fa-image', t('ramon-point-system.forum.my_decorations.cover') as string) : null,
      titleEnabled ? item('title', 'fas fa-id-badge', t('ramon-point-system.forum.my_decorations.custom_title') as string) : null,
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

  // Builds the live-preview block — modelled after Avocado's profile hero
  // and Flarum's UserCard. Cover banner + large framed avatar + decorated
  // username + optional custom title chip. Lets the user see EXACTLY how
  // they'll appear on their own profile page before equipping/changing
  // decorations.
  renderLivePreview(user: any, equippedNameSlug: string) {
    const coverPath = user.attribute?.('equippedCoverDecorationUrl') as string | undefined;
    const titleSlug = String(user.attribute?.('equippedTitleDecorationSlug') || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const titleText = user.attribute?.('equippedTitleDecorationText') as string | undefined;
    const balance = Number(user.attribute?.('pointBalance') ?? 0);
    const currencyIcon = (app.forum.attribute('pointSystem.currency_icon') as string) || 'fas fa-coins';
    const coverUrl = coverPath ? this.resolveAsset(String(coverPath)) : '';
    // CSS custom property carrying the cover URL — matches the same
    // `--ps-cover-url` plumbing the global cover-decoration rule uses on
    // .UserCard / .UserHero / .AvocadoUserPage-hero (see less/forum.less).
    const heroStyle = coverUrl ? `--ps-cover-url: url("${safeCssUrl(coverUrl)}")` : '';

    // Standalone hero — no surrounding `<section class="PointSystemDecorations-preview">`
    // and no "Live preview" heading. The hero is its own self-contained
    // representation of the user's current decorations, matching the
    // hero element on the public profile.
    return (
      <div className={`PointSystemDecorations-previewHero UserHero ${coverUrl ? 'ps-has-cover' : ''}`} style={heroStyle}>
        <div className="PointSystemDecorations-previewHero-inner">
          <div className="PointSystemDecorations-previewHero-avatar">
            <Avatar user={user} />
          </div>
          <div className="PointSystemDecorations-previewHero-meta">
            <h3 className={`PointSystemDecorations-previewHero-name ${equippedNameSlug ? `ps-name-${equippedNameSlug}` : ''}`}>
              <span className="username ps-name-text">{user.displayName?.() || user.username?.()}</span>
            </h3>
            {titleText && titleSlug && (
              <span className={`PointSystemUserTitle ps-title-${titleSlug} PointSystemUserTitle--inPreview`}>{titleText}</span>
            )}
            <div className="PointSystemDecorations-previewHero-stats">
              <span className="PointSystemProfilePill">
                <i className={currencyIcon} aria-hidden="true" /> {balance.toLocaleString()} {pointsLabel(app)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Maps the current tab to the JSON:API type that SubmitDecorationModal
  // expects. Returns null for the "all" tab (no implicit type).
  currentSubmitType(): string | null {
    const tab = this.tab;
    if (tab === 'all') return null;
    return {
      avatar: 'avatar_decoration',
      name: 'name_decoration',
      cover: 'cover_decoration',
      title: 'title_decoration',
      'post-hl': 'post_highlight_decoration',
    }[tab as string] as string | null;
  }

  resolveAsset(path: string): string {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    const base = (app.forum.attribute('assetsBaseUrl') as string | undefined) || (app.forum.attribute('baseUrl') as string) + '/assets';
    return base.replace(/\/+$/, '') + '/' + String(path).replace(/^\/+/, '');
  }

  // Composite preview matching the shop card: user's avatar on the bottom,
  // the decoration frame layered on top. Reuses the shop's existing
  // `.PointSystemShop-avatarPreview` LESS so the two pages render the same
  // shape.
  avatarPreview(d: any) {
    const src = d.imageUrl || d.imagePath || '';
    const url = src ? this.resolveAsset(String(src)) : '';
    const userAvatarUrl = app.session.user?.avatarUrl?.();
    return (
      <div className="PointSystemShop-avatarPreview PointSystemDecorations-avatarPreview">
        {userAvatarUrl ? (
          <img className="PointSystemShop-avatarPreview-img" src={userAvatarUrl} alt="" />
        ) : (
          <span className="PointSystemShop-avatarPreview-placeholder" aria-hidden="true">
            <i className="fas fa-user" />
          </span>
        )}
        {url && <img className="PointSystemShop-avatarPreview-frame" src={url} alt={d.name} />}
      </div>
    );
  }
}
