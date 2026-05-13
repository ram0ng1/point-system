// @ts-nocheck
import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import Button from 'flarum/common/components/Button';
import Tooltip from 'flarum/common/components/Tooltip';
import LinkButton from 'flarum/common/components/LinkButton';

interface ShopItem {
  id: number;
  type: 'avatar_decoration' | 'name_decoration';
  name: string;
  description: string | null;
  price: number;
  // avatar specific
  imagePath?: string;
  isAnimated?: boolean;
  // name specific
  slug?: string;
  preset?: string | null;
  customCss?: string | null;
}

export default class ShopPage extends Page {
  loading = false;
  tab: 'avatar' | 'name' | 'tiers' = 'avatar';
  claiming = new Set<string>();

  oninit(vnode: any) {
    super.oninit(vnode);
    // Permission gate — users without `pointSystem.viewShop` get a 404-style
    // page. The nav entry is already hidden for them, but they could still
    // reach this URL by typing it or following an old link.
    if (!app.forum.attribute('pointSystemCanViewShop')) return;
    const title = app.translator.trans('ramon-point-system.forum.shop.title') as string;
    app.history.push('shop', title);
    app.setTitle(title);
  }

  view() {
    if (!app.forum.attribute('pointSystemCanViewShop')) {
      return (
        <div className="PointSystemShop-notFound container">
          <h1>404</h1>
          <p>{app.translator.trans('ramon-point-system.forum.shop.not_found')}</p>
        </div>
      );
    }

    const user = app.session.user;
    const items = this.tab === 'avatar' ? this.avatarItems() : this.tab === 'name' ? this.nameItems() : [];
    const tiers = (app.forum.attribute('pointSystemAutoGroupTiers') as any[]) || [];

    return (
      <div className="PointSystemShop">
        <div className="PointSystemShop-header container">
          <h1>{app.translator.trans('ramon-point-system.forum.shop.title')}</h1>
          <p className="PointSystemShop-subtitle">
            {app.translator.trans('ramon-point-system.forum.shop.subtitle')}
          </p>
          {user && (
            <div className="PointSystemShop-balance">
              <span className="PointSystemShop-balance-item">
                <i className={(app.forum.attribute('pointSystem.currency_icon') as string) || 'fas fa-coins'} />
                <span>
                  {app.translator.trans('ramon-point-system.forum.shop.your_balance')}:{' '}
                  <strong>{Number(user.attribute('pointBalance') ?? 0).toLocaleString()}</strong>
                </span>
              </span>
              {app.forum.attribute('pointSystem.lifetime_enabled') !== false && (
                <span className="PointSystemShop-balance-item PointSystemShop-balance-item--lifetime">
                  <i className="fas fa-chart-line" />
                  <span>
                    {app.translator.trans('ramon-point-system.forum.shop.lifetime')}:{' '}
                    <strong>{Number(user.attribute('pointLifetime') ?? 0).toLocaleString()}</strong>
                  </span>
                </span>
              )}
              <LinkButton href={app.route('pointSystem.decorations')} icon="fas fa-tshirt" className="Button Button--link">
                {app.translator.trans('ramon-point-system.forum.shop.my_decorations')}
              </LinkButton>
            </div>
          )}
        </div>

        <div className="PointSystemShop-tabs container">
          <button
            className={`PointSystemShop-tab ${this.tab === 'avatar' ? 'is-active' : ''}`}
            onclick={() => (this.tab = 'avatar')}
          >
            <i className="fas fa-user-circle" />{' '}
            {app.translator.trans('ramon-point-system.forum.shop.tab_avatar')}
          </button>
          <button
            className={`PointSystemShop-tab ${this.tab === 'name' ? 'is-active' : ''}`}
            onclick={() => (this.tab = 'name')}
          >
            <i className="fas fa-font" />{' '}
            {app.translator.trans('ramon-point-system.forum.shop.tab_name')}
          </button>
          {tiers.length > 0 && (
            <button
              className={`PointSystemShop-tab ${this.tab === 'tiers' ? 'is-active' : ''}`}
              onclick={() => (this.tab = 'tiers')}
            >
              <i className="fas fa-layer-group" />{' '}
              {app.translator.trans('ramon-point-system.forum.shop.tab_tiers')}
            </button>
          )}
        </div>

        {this.tab === 'tiers' ? (
          this.renderTiers(user)
        ) : (
          <div className="container">
            {items.length === 0 ? (
              <div className="PointSystemShop-empty">
                {app.translator.trans('ramon-point-system.forum.shop.empty')}
              </div>
            ) : (
              <div className="PointSystemShop-grid">
                {items.map((it) => this.renderCard(it))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  renderTiers(user: any) {
    const tiers = (app.forum.attribute('pointSystemAutoGroupTiers') as any[]) || [];
    if (!tiers.length) {
      return (
        <div className="container">
          <div className="PointSystemShop-empty">
            {app.translator.trans('ramon-point-system.forum.shop.tiers_empty')}
          </div>
        </div>
      );
    }

    const balance = Number(user?.attribute('pointBalance') ?? 0);
    const userGroupIds = new Set(((user?.groups?.() || []) as any[]).filter(Boolean).map((g: any) => Number(g.id())));

    return (
      <div className="container PointSystemShop-tiers">
        <p className="PointSystemShop-subtitle">
          {app.translator.trans('ramon-point-system.forum.shop.tiers_help')}
        </p>
        <div className="PointSystemShop-tiersGrid">
          {tiers.map((t: any) => {
            const cost = Number(t.pointsRequired || 0);
            const canAfford = user && balance >= cost;
            const owned = user && userGroupIds.has(Number(t.groupId));
            const progress = user && cost > 0
              ? Math.min(100, Math.max(0, Math.round((balance / cost) * 100)))
              : 0;
            const claimKey = `tier:${t.id}`;
            const isClaiming = this.claiming.has(claimKey);

            return (
              <div className={`PointSystemShop-tier ${canAfford ? 'is-reached' : ''} ${owned ? 'is-owned' : ''}`} key={t.id}>
                <div
                  className="PointSystemShop-tier-badge"
                  style={t.groupColor ? `background:${t.groupColor}` : undefined}
                >
                  <i className={t.groupIcon || 'fas fa-medal'} />
                </div>
                <div className="PointSystemShop-tier-body">
                  <div className="PointSystemShop-tier-name">{t.groupName || '—'}</div>
                  <div className="PointSystemShop-tier-points">
                    <i className={(app.forum.attribute('pointSystem.currency_icon') as string) || 'fas fa-coins'} />{' '}
                    {Number(cost).toLocaleString()}{' '}
                    {app.translator.trans('ramon-point-system.forum.shop.tier_cost')}
                  </div>
                  {user && !owned && cost > 0 && (
                    <div className="PointSystemShop-tier-progressBar">
                      <span style={`width:${progress}%`} />
                    </div>
                  )}
                </div>
                <div className="PointSystemShop-tier-action">
                  {user && owned && (
                    <Button className="Button Button--primary PointSystemShop-equippedBtn" disabled>
                      <i className="fas fa-check" />{' '}
                      {app.translator.trans('ramon-point-system.forum.shop.tier_claimed')}
                    </Button>
                  )}
                  {user && !owned && canAfford && (
                    <Button
                      className="Button Button--primary"
                      loading={isClaiming}
                      onclick={() => this.claimTier(t)}
                    >
                      {app.translator.trans('ramon-point-system.forum.shop.tier_claim')}
                    </Button>
                  )}
                  {user && !owned && !canAfford && (
                    <Button className="Button" disabled>
                      {app.translator.trans('ramon-point-system.forum.shop.tier_not_enough')}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  async claimTier(tier: any) {
    const key = `tier:${tier.id}`;
    this.claiming.add(key);
    m.redraw();

    try {
      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
      const res: any = await app.request({
        method: 'POST',
        url: `${apiUrl}/point-system/tier-claim`,
        body: { id: tier.id },
      });

      // Optimistic UI: update group membership AND the balance pill so the
      // tier card flips to "Joined" and the new balance shows immediately.
      const user = app.session.user;
      if (user) {
        const existing = ((user as any).data?.relationships?.groups?.data || []).slice();
        if (!existing.find((g: any) => String(g.id) === String(tier.groupId))) {
          existing.push({ type: 'groups', id: String(tier.groupId) });
          (user as any).pushData({ relationships: { groups: { data: existing } } });
        }
        // Server returns the fresh balance after deduction.
        const data = res?.data || res;
        if (data?.balance !== undefined) {
          user.pushAttributes({ pointBalance: Number(data.balance) });
        }
      }

      app.alerts.show({ type: 'success' }, app.translator.trans('ramon-point-system.forum.shop.tier_claimed_alert', { name: tier.groupName }));
    } catch (e: any) {
      const detail = e?.response?.errors?.[0]?.detail || app.translator.trans('ramon-point-system.forum.shop.tier_claim_failed');
      app.alerts.show({ type: 'error' }, detail);
    } finally {
      this.claiming.delete(key);
      m.redraw();
    }
  }

  renderCard(item: ShopItem) {
    const user = app.session.user;
    const balance = Number(user?.attribute('pointBalance') ?? 0);
    const owned = this.userOwns(item);
    const equipped = this.userEquipped(item);
    const canAfford = balance >= item.price;
    const claimKey = `${item.type}:${item.id}`;
    const isClaiming = this.claiming.has(claimKey);

    const cardCls = [
      'PointSystemShop-card',
      item.isAnimated ? 'is-animated' : '',
      owned ? 'is-owned' : '',
      equipped ? 'is-equipped' : '',
    ].filter(Boolean).join(' ');

    return (
      <div className={cardCls}>
        {equipped && (
          <div className="PointSystemShop-card-equippedRibbon">
            <i className="fas fa-check-circle" />{' '}
            {app.translator.trans('ramon-point-system.forum.shop.equipped_label')}
          </div>
        )}

        <div className="PointSystemShop-card-preview">
          {item.type === 'avatar_decoration' ? this.previewAvatar(item) : this.previewName(item)}
        </div>

        <div className="PointSystemShop-card-body">
          <h3 className="PointSystemShop-card-title">{item.name}</h3>
          {item.description && <p className="PointSystemShop-card-desc">{item.description}</p>}
          <div className="PointSystemShop-card-price">
            <i className={(app.forum.attribute('pointSystem.currency_icon') as string) || 'fas fa-coins'} />
            <strong>{item.price.toLocaleString()}</strong>
          </div>

          {!user && (
            <Tooltip text={app.translator.trans('ramon-point-system.forum.shop.must_login') as string}>
              <span style="display: inline-block">
                <Button className="Button" disabled>
                  {app.translator.trans('ramon-point-system.forum.shop.login_to_claim')}
                </Button>
              </span>
            </Tooltip>
          )}

          {user && equipped && (
            <Button className="Button Button--primary PointSystemShop-equippedBtn" disabled>
              <i className="fas fa-check" />{' '}
              {app.translator.trans('ramon-point-system.forum.shop.equipped')}
            </Button>
          )}

          {user && owned && !equipped && (
            <Button
              className="Button Button--primary"
              loading={isClaiming}
              onclick={() => this.equip(item)}
            >
              <i className="fas fa-bolt" />{' '}
              {app.translator.trans('ramon-point-system.forum.shop.equip')}
            </Button>
          )}

          {user && !owned && (
            <Button
              className="Button Button--primary"
              disabled={!canAfford}
              loading={isClaiming}
              onclick={() => this.claim(item)}
            >
              {canAfford
                ? app.translator.trans('ramon-point-system.forum.shop.claim')
                : app.translator.trans('ramon-point-system.forum.shop.not_enough')}
            </Button>
          )}
        </div>
      </div>
    );
  }

  userEquipped(item: ShopItem): boolean {
    const user = app.session.user;
    if (!user) return false;
    if (item.type === 'avatar_decoration') {
      return Number(user.attribute('equippedAvatarDecorationId') ?? 0) === Number(item.id);
    }
    return Number(user.attribute('equippedNameDecorationId') ?? 0) === Number(item.id);
  }

  previewAvatar(item: ShopItem) {
    const url = item.imagePath ? this.resolveAsset(item.imagePath) : '';
    const userAvatarUrl = app.session.user?.avatarUrl?.();
    return (
      <div className="PointSystemShop-avatarPreview">
        {userAvatarUrl ? (
          <img className="PointSystemShop-avatarPreview-img" src={userAvatarUrl} alt="" />
        ) : (
          <span className="PointSystemShop-avatarPreview-placeholder" aria-hidden="true">
            <i className="fas fa-user" />
          </span>
        )}
        {url && <img className="PointSystemShop-avatarPreview-frame" src={url} alt="" />}
      </div>
    );
  }

  previewName(item: ShopItem) {
    const slug = String(item.slug || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const username = app.session.user?.username?.() || 'Username';
    return (
      <div className="PointSystemShop-namePreview">
        <span className={`ps-name-preview ps-name-${slug}`}>{username}</span>
      </div>
    );
  }

  avatarItems(): ShopItem[] {
    const raw = (app.forum.attribute('pointSystemAvatarDecorations') as any[]) || [];
    return raw.map((d) => ({ ...d, type: 'avatar_decoration' as const }));
  }

  nameItems(): ShopItem[] {
    const raw = (app.forum.attribute('pointSystemNameDecorations') as any[]) || [];
    return raw.map((d) => ({ ...d, type: 'name_decoration' as const }));
  }

  userOwns(item: ShopItem): boolean {
    const list = (app.session.user?.attribute('ownedDecorationIds') as any[]) || [];
    return list.some((o) => o.type === item.type && Number(o.id) === Number(item.id));
  }

  async claim(item: ShopItem) {
    const key = `${item.type}:${item.id}`;
    this.claiming.add(key);
    m.redraw();

    try {
      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
      const res = await app.request({
        method: 'POST',
        url: `${apiUrl}/point-system/claim/${item.id}`,
        body: { type: item.type },
      });

      // Optimistically update local state
      const owned = (app.session.user.attribute('ownedDecorationIds') as any[]) || [];
      owned.push({ type: item.type, id: item.id });
      app.session.user.pushAttributes({
        ownedDecorationIds: owned,
        pointBalance: Math.max(0, Number(app.session.user.attribute('pointBalance') ?? 0) - item.price),
      });

      app.alerts.show({ type: 'success' }, app.translator.trans('ramon-point-system.forum.shop.claimed', { name: item.name }));
    } catch (e: any) {
      const detail = e?.response?.errors?.[0]?.detail || app.translator.trans('ramon-point-system.forum.shop.claim_failed');
      app.alerts.show({ type: 'error' }, detail);
    } finally {
      this.claiming.delete(key);
      m.redraw();
    }
  }

  async equip(item: ShopItem) {
    const key = `${item.type}:${item.id}`;
    this.claiming.add(key);
    m.redraw();
    try {
      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
      await app.request({
        method: 'POST',
        url: `${apiUrl}/point-system/equip`,
        body: { type: item.type, id: item.id },
      });
      // Update local cache so the rest of the UI re-renders with the new deco
      if (item.type === 'avatar_decoration') {
        app.session.user.pushAttributes({
          equippedAvatarDecorationId: item.id,
          equippedAvatarDecorationUrl: item.imagePath,
        });
      } else {
        app.session.user.pushAttributes({
          equippedNameDecorationId: item.id,
          equippedNameDecorationSlug: item.slug,
        });
      }
      app.alerts.show({ type: 'success' }, app.translator.trans('ramon-point-system.forum.shop.equipped_alert', { name: item.name }));
    } catch (e: any) {
      const detail = e?.response?.errors?.[0]?.detail || app.translator.trans('ramon-point-system.forum.shop.equip_failed');
      app.alerts.show({ type: 'error' }, detail);
    } finally {
      this.claiming.delete(key);
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
