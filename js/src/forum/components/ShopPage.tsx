// @ts-nocheck
import app from 'flarum/forum/app';
import Page from 'flarum/common/components/Page';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import Button from 'flarum/common/components/Button';
import Tooltip from 'flarum/common/components/Tooltip';
import LinkButton from 'flarum/common/components/LinkButton';
import SelectDropdown from 'flarum/common/components/SelectDropdown';
import ConfirmPurchaseModal from './ConfirmPurchaseModal';

interface ShopItem {
  id: number;
  type: 'avatar_decoration' | 'name_decoration' | 'cover_decoration' | 'title_decoration' | 'post_highlight_decoration';
  name: string;
  description: string | null;
  price: number;
  // avatar / cover specific
  imagePath?: string;
  isAnimated?: boolean;
  // name / title / post-hl specific
  slug?: string;
  preset?: string | null;
  customCss?: string | null;
  // title specific
  titleText?: string;
  color?: string | null;
}

type ShopTab = 'avatar' | 'name' | 'cover' | 'title' | 'post-hl' | 'tiers';

export default class ShopPage extends Page {
  loading = false;
  claiming = new Set<string>();

  // Active tab is derived from the route param `tab` so that each section has
  // its own URL (/rewards/name, /rewards/cover, /rewards/tiers). The bare
  // `/rewards` path falls back to 'avatar' below.
  get tab(): ShopTab {
    const raw = m.route.param('tab');
    const valid: ShopTab[] = ['avatar', 'name', 'cover', 'title', 'post-hl', 'tiers'];
    return (valid as string[]).includes(raw) ? (raw as ShopTab) : 'avatar';
  }

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
    const items =
      this.tab === 'avatar'
        ? this.avatarItems()
        : this.tab === 'name'
          ? this.nameItems()
          : this.tab === 'cover'
            ? this.coverItems()
            : this.tab === 'title'
              ? this.titleItems()
              : this.tab === 'post-hl'
                ? this.postHlItems()
                : [];
    const tiers = (app.forum.attribute('pointSystemGroupOffers') as any[]) || [];
    const coverEnabled = app.forum.attribute('pointSystem.cover_deco_enabled') !== false;
    const titleEnabled = app.forum.attribute('pointSystem.title_deco_enabled') !== false;
    const postHlEnabled = app.forum.attribute('pointSystem.post_hl_deco_enabled') !== false;

    return (
      <div className="PointSystemShop">
        <div className="PointSystemShop-header container">
          <h1>{app.translator.trans('ramon-point-system.forum.shop.title')}</h1>
          <p className="PointSystemShop-subtitle">{app.translator.trans('ramon-point-system.forum.shop.subtitle')}</p>
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

        <nav className="PointSystemShop-nav container">
          <SelectDropdown
            className="PointSystemShop-nav-select App-titleControl"
            buttonClassName="Button"
            accessibleToggleLabel={app.translator.trans('ramon-point-system.forum.shop.toggle_nav_label')}
          >
            {this.navItems(coverEnabled, titleEnabled, postHlEnabled, tiers.length > 0)}
          </SelectDropdown>
        </nav>

        {this.tab === 'tiers' ? (
          this.renderTiers(user)
        ) : (
          <div className="container">
            {items.length === 0 ? (
              <div className="PointSystemShop-empty">{app.translator.trans('ramon-point-system.forum.shop.empty')}</div>
            ) : (
              <div className={`PointSystemShop-grid PointSystemShop-grid--${this.tab}`}>{items.map((it) => this.renderCard(it))}</div>
            )}
          </div>
        )}
      </div>
    );
  }

  navItems(coverEnabled: boolean, titleEnabled: boolean, postHlEnabled: boolean, hasTiers: boolean) {
    // Bind explicitly — destructuring `app.translator.trans` loses the `this`
    // reference and trips `preprocessTranslation` on the default theme.
    const t = app.translator.trans.bind(app.translator);
    const current = this.tab;

    const item = (id: ShopTab, icon: string, label: string) => {
      const isActive = current === id;
      const href = app.route('pointSystem.shop.tab', { tab: id });
      return (
        <LinkButton className="Button Button--link" icon={icon} href={href} active={isActive} itemClassName={isActive ? 'active' : ''}>
          {label}
        </LinkButton>
      );
    };

    return [
      item('avatar', 'fas fa-user-circle', t('ramon-point-system.forum.shop.tab_avatar') as string),
      item('name', 'fas fa-font', t('ramon-point-system.forum.shop.tab_name') as string),
      coverEnabled ? item('cover', 'fas fa-image', t('ramon-point-system.forum.shop.tab_cover') as string) : null,
      titleEnabled ? item('title', 'fas fa-id-badge', t('ramon-point-system.forum.shop.tab_title') as string) : null,
      postHlEnabled ? item('post-hl', 'fas fa-highlighter', t('ramon-point-system.forum.shop.tab_post_hl') as string) : null,
      hasTiers ? item('tiers', 'fas fa-layer-group', t('ramon-point-system.forum.shop.tab_tiers') as string) : null,
    ];
  }

  renderTiers(user: any) {
    const offers = (app.forum.attribute('pointSystemGroupOffers') as any[]) || [];
    if (!offers.length) {
      return (
        <div className="container">
          <div className="PointSystemShop-empty">{app.translator.trans('ramon-point-system.forum.shop.tiers_empty')}</div>
        </div>
      );
    }

    const balance = Number(user?.attribute('pointBalance') ?? 0);
    const lifetime = Number(user?.attribute('pointLifetime') ?? 0);
    const userGroupIds = new Set(((user?.groups?.() || []) as any[]).filter(Boolean).map((g: any) => Number(g.id())));

    return (
      <div className="container PointSystemShop-tiers">
        <p className="PointSystemShop-subtitle">{app.translator.trans('ramon-point-system.forum.shop.tiers_help')}</p>
        <div className="PointSystemShop-tiersGrid">{offers.map((o: any) => this.renderOffer(o, user, balance, lifetime, userGroupIds))}</div>
      </div>
    );
  }

  renderOffer(offer: any, user: any, balance: number, lifetime: number, userGroupIds: Set<number>) {
    const isAuto = offer.isAuto !== false;
    const isPurchasable = !!offer.isPurchasable;
    const threshold = Number(offer.pointsRequired || 0);
    const price = Number(offer.price || 0);
    const owned = user && userGroupIds.has(Number(offer.groupId));
    const qualifiedByLifetime = isAuto && lifetime >= threshold;
    const canBuy = user && isPurchasable && balance >= price;
    const claimKey = `tier:${offer.id}`;
    const isClaiming = this.claiming.has(claimKey);
    const currencyIcon = (app.forum.attribute('pointSystem.currency_icon') as string) || 'fas fa-coins';

    const reached = qualifiedByLifetime || canBuy;
    const progress = user && isAuto && threshold > 0 ? Math.min(100, Math.max(0, Math.round((lifetime / threshold) * 100))) : 0;

    return (
      <div className={`PointSystemShop-tier ${reached ? 'is-reached' : ''} ${owned ? 'is-owned' : ''}`} key={offer.id}>
        <div className="PointSystemShop-tier-badge" style={offer.groupColor ? `background:${offer.groupColor}` : undefined}>
          <i className={offer.groupIcon || 'fas fa-medal'} />
        </div>
        <div className="PointSystemShop-tier-body">
          <div className="PointSystemShop-tier-name">{offer.groupName || '—'}</div>

          {isAuto && (
            <div className="PointSystemShop-tier-points PointSystemShop-tier-points--threshold">
              <i className="fas fa-bolt" /> {Number(threshold).toLocaleString()}{' '}
              {app.translator.trans('ramon-point-system.forum.shop.tier_threshold')}
            </div>
          )}
          {isPurchasable && (
            <div className="PointSystemShop-tier-points PointSystemShop-tier-points--price">
              <i className={currencyIcon} /> {Number(price).toLocaleString()} {app.translator.trans('ramon-point-system.forum.shop.tier_buy_cost')}
            </div>
          )}

          {user && !owned && isAuto && threshold > 0 && !qualifiedByLifetime && (
            <div className="PointSystemShop-tier-progressBar">
              <span style={`width:${progress}%`} />
            </div>
          )}
        </div>
        <div className="PointSystemShop-tier-action">
          {user && owned && (
            <Button className="Button Button--primary PointSystemShop-equippedBtn" disabled>
              <i className="fas fa-check" /> {app.translator.trans('ramon-point-system.forum.shop.tier_claimed')}
            </Button>
          )}

          {user && !owned && qualifiedByLifetime && (
            <Button className="Button Button--primary" loading={isClaiming} onclick={() => this.confirmClaimOffer(offer, 'auto')}>
              <i className="fas fa-bolt" /> {app.translator.trans('ramon-point-system.forum.shop.tier_claim')}
            </Button>
          )}

          {user && !owned && !qualifiedByLifetime && isPurchasable && canBuy && (
            <Button className="Button Button--primary" loading={isClaiming} onclick={() => this.confirmClaimOffer(offer, 'purchase')}>
              <i className="fas fa-coins" /> {app.translator.trans('ramon-point-system.forum.shop.tier_buy')}
            </Button>
          )}

          {user && !owned && !qualifiedByLifetime && (!isPurchasable || !canBuy) && (
            <Button className="Button" disabled>
              {isPurchasable && !canBuy
                ? app.translator.trans('ramon-point-system.forum.shop.tier_not_enough')
                : app.translator.trans('ramon-point-system.forum.shop.tier_locked')}
            </Button>
          )}
        </div>
      </div>
    );
  }

  async claimTier(offer: any, mode: 'auto' | 'purchase' = 'purchase') {
    const key = `tier:${offer.id}`;
    this.claiming.add(key);
    m.redraw();

    try {
      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
      const res: any = await app.request({
        method: 'POST',
        url: `${apiUrl}/point-system/tier-claim`,
        body: { id: offer.id, mode },
      });

      const user = app.session.user;
      if (user) {
        const existing = ((user as any).data?.relationships?.groups?.data || []).slice();
        if (!existing.find((g: any) => String(g.id) === String(offer.groupId))) {
          existing.push({ type: 'groups', id: String(offer.groupId) });
          (user as any).pushData({ relationships: { groups: { data: existing } } });
        }
        const data = res?.data || res;
        if (data?.balance !== undefined) {
          user.pushAttributes({ pointBalance: Number(data.balance) });
        }
      }

      app.alerts.show({ type: 'success' }, app.translator.trans('ramon-point-system.forum.shop.tier_claimed_alert', { name: offer.groupName }));
    } catch (e: any) {
      const detail = e?.response?.errors?.[0]?.detail || app.translator.trans('ramon-point-system.forum.shop.tier_claim_failed');
      app.alerts.show({ type: 'error' }, detail);
    } finally {
      this.claiming.delete(key);
      m.redraw();
    }
  }

  coverItems(): ShopItem[] {
    const raw = (app.forum.attribute('pointSystemCoverDecorations') as any[]) || [];
    return raw.map((d) => ({ ...d, type: 'cover_decoration' as const }));
  }

  titleItems(): ShopItem[] {
    const raw = (app.forum.attribute('pointSystemTitleDecorations') as any[]) || [];
    return raw.map((d) => ({ ...d, type: 'title_decoration' as const }));
  }

  postHlItems(): ShopItem[] {
    const raw = (app.forum.attribute('pointSystemPostHighlightDecorations') as any[]) || [];
    return raw.map((d) => ({ ...d, type: 'post_highlight_decoration' as const }));
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
      `PointSystemShop-card--${item.type.replace(/_decoration$/, '').replace(/_/g, '-')}`,
      item.isAnimated ? 'is-animated' : '',
      owned ? 'is-owned' : '',
      equipped ? 'is-equipped' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={cardCls}>
        {equipped && (
          <div className="PointSystemShop-card-equippedRibbon">
            <i className="fas fa-check-circle" /> {app.translator.trans('ramon-point-system.forum.shop.equipped_label')}
          </div>
        )}

        <div className="PointSystemShop-card-preview">
          {item.type === 'avatar_decoration'
            ? this.previewAvatar(item)
            : item.type === 'cover_decoration'
              ? this.previewCover(item)
              : item.type === 'title_decoration'
                ? this.previewTitle(item)
                : item.type === 'post_highlight_decoration'
                  ? this.previewPostHl(item)
                  : this.previewName(item)}
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
              <i className="fas fa-check" /> {app.translator.trans('ramon-point-system.forum.shop.equipped')}
            </Button>
          )}

          {user && owned && !equipped && (
            <Button className="Button Button--primary" loading={isClaiming} onclick={() => this.equip(item)}>
              <i className="fas fa-bolt" /> {app.translator.trans('ramon-point-system.forum.shop.equip')}
            </Button>
          )}

          {user && !owned && (
            <Button className="Button Button--primary" disabled={!canAfford} loading={isClaiming} onclick={() => this.confirmClaim(item)}>
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
    if (item.type === 'cover_decoration') {
      return Number(user.attribute('equippedCoverDecorationId') ?? 0) === Number(item.id);
    }
    if (item.type === 'title_decoration') {
      return Number(user.attribute('equippedTitleDecorationId') ?? 0) === Number(item.id);
    }
    if (item.type === 'post_highlight_decoration') {
      return Number(user.attribute('equippedPostHighlightDecorationId') ?? 0) === Number(item.id);
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

  previewCover(item: ShopItem) {
    const url = item.imagePath ? this.resolveAsset(item.imagePath) : '';
    return (
      <div className="PointSystemShop-coverPreview">
        {url ? <img src={url} alt={item.name} /> : <div className="PointSystemShop-coverPreview-empty" />}
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

  previewTitle(item: ShopItem) {
    const slug = String(item.slug || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const text = String(item.titleText || item.name || '—');
    const styleVar = item.color ? `--ps-title-color:${String(item.color).replace(/[<>"';]/g, '')};` : '';
    return (
      <div className="PointSystemShop-titlePreview">
        <span className={`ps-title-preview ps-title-${slug}`} style={styleVar}>
          {text}
        </span>
      </div>
    );
  }

  previewPostHl(item: ShopItem) {
    const slug = String(item.slug || '').replace(/[^a-zA-Z0-9_-]/g, '');
    return (
      <div className="PointSystemShop-postHlPreview">
        <div className={`ps-posthl-preview ps-posthl-${slug}`}>
          <div className="ps-posthl-preview-avatar" />
          <div className="ps-posthl-preview-body">
            <div className="ps-posthl-preview-line" />
            <div className="ps-posthl-preview-line short" />
          </div>
        </div>
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

  confirmClaim(item: ShopItem) {
    const user = app.session.user;
    if (!user) return;
    const balance = Number(user.attribute('pointBalance') ?? 0);

    const preview =
      item.type === 'avatar_decoration'
        ? this.previewAvatar(item)
        : item.type === 'cover_decoration'
          ? this.previewCover(item)
          : this.previewName(item);

    app.modal.show(ConfirmPurchaseModal, {
      title: app.translator.trans('ramon-point-system.forum.confirm.title'),
      itemName: item.name,
      itemPrice: item.price,
      currentBalance: balance,
      preview,
      confirmLabel: app.translator.trans('ramon-point-system.forum.shop.claim'),
      onConfirm: () => this.claim(item),
    });
  }

  confirmClaimOffer(offer: any, mode: 'auto' | 'purchase') {
    const user = app.session.user;
    if (!user) return;
    const balance = Number(user.attribute('pointBalance') ?? 0);
    const isAuto = mode === 'auto';
    const cost = isAuto ? 0 : Number(offer.price || 0);

    const preview = (
      <div className="PointSystemShop-tier-badge" style={offer.groupColor ? `background:${offer.groupColor}` : undefined}>
        <i className={offer.groupIcon || 'fas fa-medal'} />
      </div>
    );

    app.modal.show(ConfirmPurchaseModal, {
      title: app.translator.trans(isAuto ? 'ramon-point-system.forum.confirm.title_tier' : 'ramon-point-system.forum.confirm.title_purchase'),
      itemName: offer.groupName || '—',
      itemPrice: cost,
      currentBalance: balance,
      preview,
      confirmLabel: app.translator.trans(isAuto ? 'ramon-point-system.forum.shop.tier_claim' : 'ramon-point-system.forum.shop.tier_buy'),
      onConfirm: () => this.claimTier(offer, mode),
    });
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
      } else if (item.type === 'cover_decoration') {
        app.session.user.pushAttributes({
          equippedCoverDecorationId: item.id,
          equippedCoverDecorationUrl: item.imagePath,
        });
      } else if (item.type === 'title_decoration') {
        app.session.user.pushAttributes({
          equippedTitleDecorationId: item.id,
          equippedTitleDecorationSlug: item.slug,
          equippedTitleDecorationText: item.titleText,
        });
      } else if (item.type === 'post_highlight_decoration') {
        app.session.user.pushAttributes({
          equippedPostHighlightDecorationId: item.id,
          equippedPostHighlightDecorationSlug: item.slug,
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
    const base = (app.forum.attribute('assetsBaseUrl') as string | undefined) || (app.forum.attribute('baseUrl') as string) + '/assets';
    return base.replace(/\/+$/, '') + '/' + String(path).replace(/^\/+/, '');
  }
}
