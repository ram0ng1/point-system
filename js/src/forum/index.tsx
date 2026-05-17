import app from 'flarum/forum/app';
import { extend } from 'flarum/common/extend';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import SessionDropdown from 'flarum/forum/components/SessionDropdown';
import Avatar from 'flarum/common/components/Avatar';
import CommentPost from 'flarum/forum/components/CommentPost';
import UserCard from 'flarum/forum/components/UserCard';
import DiscussionListItem from 'flarum/forum/components/DiscussionListItem';
import PostUser from 'flarum/forum/components/PostUser';
import LinkButton from 'flarum/common/components/LinkButton';
import Button from 'flarum/common/components/Button';
import UserControls from 'flarum/forum/utils/UserControls';
import type User from 'flarum/common/models/User';
import type Mithril from 'mithril';
import ShopPage from './components/ShopPage';
import DecorationsPage from './components/DecorationsPage';
import TradesPage from './components/TradesPage';
import UserTradesPage from './components/UserTradesPage';
import UserPage from 'flarum/forum/components/UserPage';
import AwardPointsModal from './components/AwardPointsModal';
import PointsManualNotification from './components/PointsManualNotification';
import TierClaimedNotification from './components/TierClaimedNotification';
import ItemGrantedNotification from './components/ItemGrantedNotification';
import TradeRequestedNotification from './components/TradeRequestedNotification';
import TradeAcceptedNotification from './components/TradeAcceptedNotification';
import TradeCompletedNotification from './components/TradeCompletedNotification';
import TradeModal from './components/TradeModal';
import { applyAvatarDecoration } from './utils/applyAvatarDecoration';
import { applyNameDecorationClass } from './utils/applyNameDecoration';
import { pointsLabel } from '../common/utils/pointsLabel';
import { safeCssUrl } from '../common/utils/safeCssUrl';

declare const m: Mithril.Static;

const setting = (key: string, fallback = true): boolean => {
  const v = app.forum.attribute(key);
  return v === undefined || v === null ? fallback : !!v;
};

app.initializers.add('ramon/point-system', () => {
  // ── Routes ──────────────────────────────────────────────────────────────
  // Tab routes mount the SAME component as the bare route and let it pick
  // the active section from `m.route.param('tab')`. We register the bare
  // path first so `app.route('pointSystem.shop')` resolves to /rewards
  // (used by external nav links) while users that bookmark a specific tab
  // (e.g. /rewards/name) land on it directly.
  app.routes['pointSystem.shop'] = { path: '/rewards', component: ShopPage };
  app.routes['pointSystem.shop.tab'] = { path: '/rewards/:tab', component: ShopPage };
  app.routes['pointSystem.decorations'] = { path: '/decorations', component: DecorationsPage };
  app.routes['pointSystem.decorations.tab'] = { path: '/decorations/:tab', component: DecorationsPage };
  app.routes['pointSystem.trades'] = { path: '/trades', component: TradesPage };
  app.routes['user.trades'] = { path: '/u/:username/trades', component: UserTradesPage };

  // ── Notification components ─────────────────────────────────────────────
  app.notificationComponents.pointsManual = PointsManualNotification;
  app.notificationComponents.pointSystemTierClaimed = TierClaimedNotification;
  app.notificationComponents.pointSystemItemGranted = ItemGrantedNotification;
  app.notificationComponents.pointSystemTradeRequested = TradeRequestedNotification;
  app.notificationComponents.pointSystemTradeAccepted = TradeAcceptedNotification;
  app.notificationComponents.pointSystemTradeCompleted = TradeCompletedNotification;

  // ── Inject the dynamic name-decoration <style> block once ───────────────
  // Deferred: `app.forum` isn't populated until after initializers finish.
  app.beforeMount(() => {
    injectNameDecorationStyles();
    injectTitleDecorationStyles();
    injectPostHighlightDecorationStyles();
    installDomObservers();
    // Hide-badges-with-avatar-deco setting: just toggle a body class. The
    // actual hiding is done by CSS rules in forum.less which use `:has()` to
    // scope to user-containers that wrap a decorated avatar. We deliberately
    // do NOT use a JS DOM hider here — Mithril removes inline styles on
    // every redraw, so styling via CSS is the only reliable path.
    if (setting('pointSystem.hide_badges_with_avatar_deco', false)) {
      document.body.classList.add('ps-hide-badges-with-deco');
    }
  });

  // ── Rewards entry in the IndexSidebar nav dropdown ──────────────────────
  //
  // This is the SAME single hook the avocado theme uses for every nav entry
  // it adds (Popular, Search, Team): a single `extend(IndexSidebar.prototype,
  // 'navItems')` with a priority that slots into the dropdown's natural
  // order (110 → 90 in avocado). We don't add a sibling button on `items()`
  // or stamp the entry on `HeaderPrimary`/`SessionDropdown` — themes that
  // care about mobile (avocado, etc.) already mount IndexSidebar on every
  // page via `PageStructure.sidebar` override, so this dropdown is the
  // canonical place. On stock Flarum, the dropdown is only mounted on the
  // IndexPage — which is the standard core UX; users without a custom theme
  // reach the Rewards page via direct URL or the new-discussion-area links.
  extend(IndexSidebar.prototype, 'navItems', function (items) {
    if (!app.forum.attribute('pointSystemCanViewShop')) return;
    const icon = (app.forum.attribute('pointSystem.currency_icon') as string) || 'fas fa-coins';
    items.add(
      'pointSystem-shop',
      <LinkButton href={app.route('pointSystem.shop')} icon={icon}>
        {app.translator.trans('ramon-point-system.forum.nav.shop')}
      </LinkButton>,
      // Sits just below avocado's "Team" (90) but above the default end.
      // Stock Flarum has only "All Discussions" at 100 here, so we land
      // directly under it — a sensible position in either environment.
      85
    );
  });

  // ── Avatar decoration — applies wherever <Avatar user={...}/> is rendered
  // (covers Flarum core + every theme that uses the standard component).
  extend(Avatar.prototype, 'view', function (this: any, vnode: any) {
    if (!setting('pointSystem.avatar_deco_enabled')) return;
    const user = this.attrs.user as User | undefined;
    const url = user?.attribute?.('equippedAvatarDecorationUrl') as string | undefined;
    if (!url) return;
    applyAvatarDecoration(vnode, resolveAssetUrl(url));
  });

  // ── Name decoration — append `ps-name-{slug}` to the rendered root via
  // each component's `classes()` array method. This is the idiomatic Flarum 2
  // path: classes() runs BEFORE the className string is joined into attrs,
  // so the class participates in the normal flow instead of being mutated
  // onto an already-built vnode (which is brittle for class components).
  extend(CommentPost.prototype, 'classes', function (this: any, classes: string[]) {
    const user = this.attrs.post?.user?.();
    if (setting('pointSystem.name_deco_enabled') && setting('pointSystem.deco_in_posts')) {
      pushDecoClass(classes, user);
    }
    // Post highlight: tag the CommentPost root with `ps-posthl-{slug}` so the
    // global stylesheet (built-in presets + admin custom CSS injected above)
    // can render a border / glow / ribbon around the post. Same plumbing as
    // the name decoration class push — relies on the Mithril classes() hook
    // (no DOM mutation) so it survives every redraw.
    if (setting('pointSystem.post_hl_deco_enabled') && setting('pointSystem.deco_in_posts')) {
      pushPostHlClass(classes, user);
    }
  });
  extend(UserCard.prototype, 'view', function (this: any, vnode: any) {
    // UserCard doesn't have a classes() method, so fall back to vnode mutation.
    if (setting('pointSystem.name_deco_enabled') && setting('pointSystem.deco_in_user_card')) {
      applyNameDecorationClass(vnode, this.attrs.user);
    }

    // Cover decoration: stamp a CSS class + custom property on the root so
    // the LESS rule below can render the banner as `::before`. We avoid
    // setting `background-image` directly so the cover sits in its own
    // stacking context (clean rounded corners, no overlay bleed on text).
    if (setting('pointSystem.cover_deco_enabled')) {
      const user = this.attrs.user as User | undefined;
      const coverPath = user?.attribute?.('equippedCoverDecorationUrl') as string | undefined;
      if (coverPath) {
        const url = resolveAssetUrl(String(coverPath));
        vnode.attrs = vnode.attrs || {};
        const existing = String(vnode.attrs.className || '');
        if (!existing.includes('ps-has-cover')) {
          vnode.attrs.className = `${existing} ps-has-cover`.trim();
        }
        const prevStyle = vnode.attrs.style || '';
        const safeUrl = safeCssUrl(url);
        const styleAdd = `--ps-cover-url: url("${safeUrl}");`;
        vnode.attrs.style =
          typeof prevStyle === 'string'
            ? `${prevStyle}${prevStyle.endsWith(';') || !prevStyle ? '' : ';'} ${styleAdd}`
            : { ...prevStyle, '--ps-cover-url': `url("${safeUrl}")` };
      }
    }
  });
  extend(DiscussionListItem.prototype, 'elementAttrs', function (this: any, attrs: Record<string, unknown>) {
    if (!setting('pointSystem.name_deco_enabled') || !setting('pointSystem.deco_in_lists')) return;
    const slug = this.attrs.discussion?.user?.()?.attribute?.('equippedNameDecorationSlug');
    if (!slug) return;
    const cleanSlug = String(slug).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanSlug) return;
    attrs.className = ((attrs.className as string) || '') + ' ps-name-' + cleanSlug;
  });

  // ── "Award points" entry in the user-profile Controls dropdown ──────────
  // Visible only when the actor has `pointSystem.manage`. Opens a small modal
  // that posts to the existing /api/point-system/award endpoint (which also
  // enforces the same permission server-side).
  extend(UserControls, 'moderationControls', function (items, user) {
    if (!app.session.user) return;
    if (!app.forum.attribute('pointSystemCanManage')) return;

    items.add(
      'pointSystem-award',
      <Button icon="fas fa-coins" onclick={() => app.modal.show(AwardPointsModal, { user })}>
        {app.translator.trans('ramon-point-system.forum.user_controls.award_points')}
      </Button>,
      85
    );
  });

  // ── "Trade" entry in the user-profile Controls dropdown ─────────────────
  // Gated by:
  //   - the trade master toggle (`pointSystemTradeEnabled`)
  //   - the per-actor permission (`pointSystemCanTrade`, which is
  //     `pointSystem.trade` AND the master toggle on the server side)
  //   - not the actor's own profile (you cannot trade with yourself)
  //
  // Extension point is `userControls` — Flarum core's UserControls.js defines
  // exactly three ItemList groups: `userControls` (regular user actions),
  // `moderationControls` (admin), `destructiveControls` (delete). The earlier
  // `userActions` name was wrong — that group doesn't exist in core, so the
  // button never rendered.
  // Flarum's typing of `extend()` declares one callback argument, but the
  // userControls hook actually receives `(items, user)` at runtime; cast to
  // bypass the typing mismatch.
  extend(UserControls, 'userControls', function (items: any, user: any) {
    const me = app.session.user;
    if (!me) return;
    if (Number(me.id?.()) === Number(user?.id?.())) return;
    if (!app.forum.attribute('pointSystemTradeEnabled')) return;
    if (!app.forum.attribute('pointSystemCanTrade')) return;

    items.add(
      'pointSystem-trade',
      <Button icon="fas fa-handshake" onclick={() => app.modal.show(TradeModal, { target: user })}>
        {app.translator.trans('ramon-point-system.forum.user_controls.trade')}
      </Button>,
      80
    );
  } as any);

  // ── "Trades" tab on the user profile sidebar — self-only ──────────────
  // Only visible when the viewer IS the profile owner. The corresponding
  // UserTradesPage component does its own self-check on mount as a hard
  // gate; this extension just hides the nav entry to other visitors so
  // they don't see the link at all.
  extend(UserPage.prototype, 'navItems', function (items) {
    const user = this.user;
    if (!user) return;
    const me = app.session.user;
    if (!me || Number(me.id?.()) !== Number(user.id?.())) return;
    if (!app.forum.attribute('pointSystemTradeEnabled')) return;

    // Use the top-level `import LinkButton from 'flarum/common/components/LinkButton'`.
    // The earlier `require(...).default` shim returned undefined under the
    // bundler's external-module rewrite (Flarum 2's webpack maps `flarum/*`
    // strings to externals, and the `.default` accessor fired against an
    // undefined module → Mithril's "selector must be a string or component"
    // crash on the user profile route.
    items.add(
      'pointSystem-trades',
      <LinkButton href={app.route('user.trades', { username: user.slug() })} icon="fas fa-handshake">
        {app.translator.trans('ramon-point-system.forum.user_profile.trades_link')}
      </LinkButton>,
      85
    );
  });

  // ── Session dropdown entries (next to "Settings" / "Profile") ──────────
  // Adds "My decorations" — always visible — and "Trades" — only when
  // the master toggle is on AND the actor has `pointSystem.trade`.
  // Priorities slot above the core `settings: 50` entry so the order is:
  // Profile (100) → My decorations (80) → Trades (75) → Settings (50).
  extend(SessionDropdown.prototype, 'items', function (items) {
    if (!app.session.user) return;

    items.add(
      'pointSystem-decorations',
      <LinkButton icon="fas fa-tshirt" href={app.route('pointSystem.decorations')}>
        {app.translator.trans('ramon-point-system.forum.session_dropdown.my_decorations')}
      </LinkButton>,
      80
    );

    if (app.forum.attribute('pointSystemTradeEnabled') && app.forum.attribute('pointSystemCanTrade')) {
      items.add(
        'pointSystem-trades',
        <LinkButton icon="fas fa-handshake" href={app.route('pointSystem.trades')}>
          {app.translator.trans('ramon-point-system.forum.session_dropdown.trades')}
        </LinkButton>,
        75
      );
    }
  });

  // ── Points badge + custom title in the post header ─────────────────────
  // The title is rendered in BOTH `.Post-side` (sideItems below) AND here in
  // `.PostUser` so the post can show it whichever side column is visible at
  // the current breakpoint. CSS in less/forum.less hides whichever copy
  // doesn't belong to the active layout — Post-side on @phone, PostUser on
  // @tablet-up — so only one is ever visible at a time.
  extend(PostUser.prototype, 'userViewItems', function (this: any, items) {
    const user = this.attrs.post?.user?.();
    if (!user) return;

    if (setting('pointSystem.show_in_post_header')) {
      items.add('pointSystem-postBadge', pointsBadge(user), 85);
    }

    if (setting('pointSystem.title_deco_enabled') && setting('pointSystem.deco_in_posts')) {
      const node = userTitleBadge(user, 'PointSystemUserTitle--inHeader');
      if (node) items.add('pointSystem-userTitle', node, 40);
    }
  });

  // ── Custom title below the avatar in the post side column ──────────────
  // CommentPost.sideItems is the canonical hook for things that sit next to
  // the avatar in `.Post-side`. Works on both Flarum core (avatar-only column)
  // and Avocado (which already overrides this ItemList to add `.Post-side-inner`).
  // Adding with priority 50 places the title after the avatar(=100) in both.
  extend(CommentPost.prototype, 'sideItems', function (this: any, items) {
    if (!setting('pointSystem.title_deco_enabled') || !setting('pointSystem.deco_in_posts')) return;
    const user = this.attrs.post?.user?.();
    if (!user) return;
    const node = userTitleBadge(user, 'PointSystemUserTitle--inSide');
    if (node) items.add('pointSystem-userTitle', node, 50);
  });

  // ── Points badge + equipped title on the user profile card ────────────
  // Adding the title here (same renderer as post-header / sidebar) so the
  // user's equipped title actually shows up on /u/username. Gated by both
  // the global "show points on profile" toggle AND the title-deco feature
  // flag so a forum that has titles disabled doesn't leak the markup.
  extend(UserCard.prototype, 'infoItems', function (this: any, items) {
    const user = this.attrs.user as User | undefined;
    if (!user) return;
    if (setting('pointSystem.show_in_user_profile')) {
      items.add('pointSystem-profileBadge', pointsBadge(user), 50);
    }
    if (setting('pointSystem.title_deco_enabled')) {
      const node = userTitleBadge(user, 'PointSystemUserTitle--inProfile');
      if (node) items.add('pointSystem-userTitle', node, 48);
    }
  });
});

function pointsBadge(user: User): Mithril.Children {
  const balance = Number(user.attribute?.('pointBalance') ?? 0);
  const icon = (app.forum.attribute('pointSystem.currency_icon') as string) || 'fas fa-coins';
  return (
    <span className="PointSystemPostBadge" title={balance.toLocaleString() + ' ' + pointsLabel(app)}>
      <i className={icon} aria-hidden="true" /> {balance.toLocaleString()}
    </span>
  );
}

function userTitleBadge(user: User, variantClass: string = ''): Mithril.Children {
  const slug = user?.attribute?.('equippedTitleDecorationSlug') as string | undefined;
  const text = user?.attribute?.('equippedTitleDecorationText') as string | undefined;
  if (!slug || !text) return null;
  const cleanSlug = String(slug).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleanSlug) return null;
  const cls = ['PointSystemUserTitle', `ps-title-${cleanSlug}`, variantClass].filter(Boolean).join(' ');
  return <span className={cls}>{text}</span>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────
// Name-decoration CSS supports two modes:
//   1. Property list (`color: red; font-weight: bold;`) — wrapped in the
//      default selector chain. Legacy / quick decorations.
//   2. Full CSS (contains `{`) — injected as-is, with `&` replaced by the
//      selector chain. Supports `@keyframes`, pseudo-elements, multi-rule.
// Inject CSS for title-decorations at boot. Same approach as name decorations:
// the admin-authored CSS is wrapped in a stable selector chain and a `<style>`
// block is appended to the head. Custom rules support both modes (property
// list / full CSS with `&` placeholder) and are sanitised server-side.
function injectTitleDecorationStyles(): void {
  const id = 'ps-title-deco-runtime';
  document.getElementById(id)?.remove();

  const decos = (app.forum.attribute('pointSystemTitleDecorations') as any[]) || [];
  if (!Array.isArray(decos) || decos.length === 0) return;

  const out: string[] = [];
  for (const d of decos) {
    if (!d.slug) continue;
    const cls = cssClass(d.slug);
    if (!cls) continue;
    const sel = `.ps-title-${cls},.ps-title-preview.ps-title-${cls}`;

    // Always set the colour variable so presets/css can reference it.
    if (d.color) {
      out.push(`${sel} { --ps-title-color: ${String(d.color).replace(/[<>"';]/g, '')}; }`);
    }

    const css = String(d.customCss || '').trim();
    if (!css) continue;

    if (css.includes('{')) {
      out.push(bangify(css.replace(/&/g, sel)));
    } else {
      out.push(`${sel} { ${bangify(css.replace(/}/g, '} '))} }`);
    }
  }
  if (out.length === 0) return;

  appendStyle(id, out.join('\n'));
}

function injectPostHighlightDecorationStyles(): void {
  const id = 'ps-posthl-deco-runtime';
  document.getElementById(id)?.remove();

  const decos = (app.forum.attribute('pointSystemPostHighlightDecorations') as any[]) || [];
  if (!Array.isArray(decos) || decos.length === 0) return;

  const out: string[] = [];
  for (const d of decos) {
    if (!d.slug || !d.customCss) continue;
    const cls = cssClass(d.slug);
    if (!cls) continue;
    // Highlight applies to the whole post container (CommentPost) and to the
    // shop card preview. We expose both selectors to the user's `&` symbol.
    const sel = `.CommentPost.ps-posthl-${cls},` + `.Post.ps-posthl-${cls},` + `.ps-posthl-preview.ps-posthl-${cls}`;
    const css = String(d.customCss).trim();

    if (css.includes('{')) {
      out.push(bangify(css.replace(/&/g, sel)));
    } else {
      out.push(`${sel} { ${bangify(css.replace(/}/g, '} '))} }`);
    }
  }
  if (out.length === 0) return;

  appendStyle(id, out.join('\n'));
}

function injectNameDecorationStyles(): void {
  const id = 'ps-name-deco-runtime';
  document.getElementById(id)?.remove();

  const decos = (app.forum.attribute('pointSystemNameDecorations') as any[]) || [];
  if (!Array.isArray(decos) || decos.length === 0) return;

  const out: string[] = [];
  for (const d of decos) {
    if (!d.slug || !d.customCss) continue;
    const cls = cssClass(d.slug);
    if (!cls) continue;

    // Decoration target shapes (all are text-only username carriers — never
    // the wrapper, avatar or badges). User-authored custom CSS for these
    // selectors should win the cascade against theme rules, so we append
    // `!important` to every property of the raw input below.
    //
    // The descendant selector `.ps-name-${cls} .username` would normally
    // also match usernames of OTHER users rendered inside the post —
    // notably `.Post-likedBy .username` ("Ramon liked this") and quoted
    // content. Exclude those via `:not(.Post-likedBy *)` etc. so the
    // current actor's name decoration doesn't bleed onto unrelated
    // usernames embedded in the post body.
    const inDescendant = `.ps-name-${cls} .username:not(.Post-likedBy *):not(.Post-mentionedBy *):not(blockquote *):not(.UserMention *)`;
    const selectors = `.ps-name-preview.ps-name-${cls},` + `${inDescendant},` + `.username.ps-name-${cls},` + `a.ps-name-${cls}`;
    const css = String(d.customCss).trim();

    if (css.includes('{')) {
      out.push(bangify(css.replace(/&/g, selectors)));
    } else {
      out.push(`${selectors} { ${bangify(css.replace(/}/g, '} '))} }`);
    }
  }
  if (out.length === 0) return;

  appendStyle(id, out.join('\n'));
}

// Append `!important` to every property declaration so user-authored
// decorations win the cascade against theme rules (avocado, etc.).
// Skip declarations that already include `!important`.
function bangify(s: string): string {
  return s.replace(/([\w\-]+\s*:\s*[^;{}]+?)(\s*;)/g, (m, decl, semi) => (/!\s*important/i.test(decl) ? m : decl + ' !important' + semi));
}

function appendStyle(id: string, textContent: string): void {
  const style = document.createElement('style');
  style.id = id;
  style.textContent = textContent;
  document.head.appendChild(style);
}

// ─── DOM observation (single MutationObserver) ────────────────────────────
// All theme-level taggers we install (per-letter rewriter, theme username
// tagger, `.username` span tagger, Avocado profile hooks) need to react to
// the same DOM mutations. We collect their per-node and per-attribute
// callbacks once and run all of them against each batched mutation list,
// so the page only pays for ONE `document.body` subtree observer instead of
// the four we used to install side-by-side. The cost was visible on long
// discussion pages where every Mithril redraw fired four parallel scans.

const PER_LETTER_SLUGS = new Set(['wave']);

type AddedNodeHandler = {
  selector: string;
  run: (el: Element) => void;
  scan: (root: ParentNode) => void;
};

type AttributeHandler = (target: Element, attributeName: string) => void;

const addedHandlers: AddedNodeHandler[] = [];
const attributeHandlers: AttributeHandler[] = [];

function onAdded(selector: string, run: (el: Element) => void): void {
  addedHandlers.push({
    selector,
    run,
    scan: (root) => root.querySelectorAll?.(selector).forEach(run),
  });
}

function onAttributeChange(handler: AttributeHandler): void {
  attributeHandlers.push(handler);
}

function installDomObservers(): void {
  if ((window as any).__psObserverInstalled) return;
  (window as any).__psObserverInstalled = true;

  registerPerLetterRewriter();
  registerThemeUsernameTagger();
  registerUsernameSpanTagger();
  registerAvocadoProfileHooks();

  // Initial scan of the document for handlers that registered above.
  for (const h of addedHandlers) h.scan(document);

  const hasAttributeHandlers = attributeHandlers.length > 0;

  new MutationObserver((muts) => {
    for (const mu of muts) {
      if (mu.type === 'attributes' && mu.attributeName) {
        const target = mu.target as Element;
        for (const ah of attributeHandlers) ah(target, mu.attributeName);
        continue;
      }
      mu.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        for (const h of addedHandlers) {
          if (node.matches?.(h.selector)) h.run(node);
          else h.scan(node);
        }
      });
    }
  }).observe(document.body, {
    childList: true,
    subtree: true,
    // Only ask the browser to fire on attribute mutations when something
    // actually subscribes to them. Without this every class-toggle in the
    // app would walk the (empty) handler list on the main thread.
    ...(hasAttributeHandlers ? { attributes: true as const, attributeFilter: ['class'] } : {}),
  });
}

// ─── Per-letter rewriter ─────────────────────────────────────────────────
// Some presets (Wave) require each character of the username to be its own
// `<span>` so they can be animated with staggered `animation-delay`s. CSS
// can't do that on its own, so we walk new `.username` elements at runtime
// and rewrite their text into per-character spans — but ONLY when their
// closest `ps-name-{slug}` ancestor matches a slug in PER_LETTER_SLUGS.
function registerPerLetterRewriter(): void {
  // Find the active deco slug. Look at the element's OWN classes first
  // (covers `.ps-name-preview.ps-name-X` used by the shop/admin live preview),
  // then walk up to find an ancestor wrapper class (`.ps-name-X` on
  // CommentPost, UserCard, etc., with `.username` inside).
  const findDecoSlug = (el: Element): string | null => {
    let node: Element | null = el;
    while (node) {
      for (const cls of Array.from(node.classList)) {
        if (cls.startsWith('ps-name-') && cls !== 'ps-name-preview') {
          return cls.slice('ps-name-'.length);
        }
      }
      node = node.parentElement;
    }
    return null;
  };

  const rewrite = (el: Element) => {
    const slug = findDecoSlug(el);
    if (!slug || !PER_LETTER_SLUGS.has(slug)) return;
    if ((el as HTMLElement).dataset.psPerLetter === slug) return;
    (el as HTMLElement).dataset.psPerLetter = slug;

    // Snapshot childNodes — we mutate during iteration. Only text nodes get
    // replaced with per-letter spans. Other children (like the verified
    // popover anchor inside `.AvocadoUserPage-hero-name`) stay intact.
    //
    // Each generated span gets `.ps-letter` so CSS rules can target them
    // unambiguously, AND a `--ps-i` custom property carrying the letter index
    // so the animation-delay can be computed via `calc(var(--ps-i) * 0.05s)`
    // — works regardless of how many non-letter siblings are around (verified
    // badge, etc.) and scales to any name length without an nth-child list.
    const nodes = Array.from(el.childNodes);
    let index = 0;
    for (const node of nodes) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      const text = (node.textContent || '').trim();
      if (!text) continue;
      const frag = document.createDocumentFragment();
      for (const ch of text) {
        const span = document.createElement('span');
        span.className = 'ps-letter';
        span.style.setProperty('--ps-i', String(index));
        span.textContent = ch;
        frag.appendChild(span);
        index++;
      }
      (node as Text).replaceWith(frag);
    }
  };

  // Scan targets:
  //   - `.username`             Flarum's username helper
  //   - `.ps-name-preview`      shop/admin live preview
  //   - `.ps-name-text`         our wrapper span for theme contexts that mix
  //                             username text with sibling badges (avocado h1)
  //   - `a[data-ps-name-deco]`  anchors tagged by registerThemeUsernameTagger
  //                             (avocado thread cards, mentions, etc.)
  onAdded('.username, .ps-name-preview, .ps-name-text, a[data-ps-name-deco]', rewrite);
}

// ─── Theme username decoration tagger ───────────────────────────────────
// For themes (Avocado, etc.) that render a username as plain text inside an
// anchor link (`<a class="AvocadoHome-threadAuthor" href="/u/X">Ramon</a>`)
// instead of using Flarum's `username()` helper that emits `.username`. Our
// regular CSS selectors don't match that markup, so we tag the anchor itself
// at runtime with `ps-name-{slug}`. Critically, we SKIP anchors that wrap an
// `<img>` / `.Avatar` — those are avatar links, NOT name links, and tagging
// them would apply the decoration to the avatar.
// Containers where username links appear in NON-authorial contexts —
// "X liked this", "mentioned by X", quote buttons that reference a user,
// etc. Decorating these makes the deco bleed into prose ("Ramon liked
// this" gets the glitch animation on just "Ramon" amid surrounding plain
// text), which the user reported as a bug. The tagger skips any anchor /
// span sitting inside one of these.
const SECONDARY_USERNAME_CONTAINERS = [
  '.Post-likedBy',
  '.Post-mentionedBy',
  '.PostMention',
  '.Post-quoteButtonContainer',
  '.Post-actions',
  '.Notification',
  '.NotificationList',
  '.SearchResult',
  '.DiscussionListItem-info',
].join(',');

function isInSecondaryContext(el: Element): boolean {
  return !!el.closest(SECONDARY_USERNAME_CONTAINERS);
}

function registerThemeUsernameTagger(): void {
  if (!setting('pointSystem.name_deco_enabled') || !setting('pointSystem.deco_in_lists')) return;

  const decorate = (el: Element) => {
    const a = el as HTMLAnchorElement;
    if (a.dataset.psNameDeco) return;
    if (isInSecondaryContext(a)) return;
    // Skip avatar-wrapping anchors — the username link is text-only.
    if (a.querySelector('img, .Avatar, .ps-avatar-deco-wrap')) return;
    const m = /\/u\/([^/?#]+)/.exec(a.getAttribute('href') || '');
    if (!m) return;
    a.dataset.psNameDeco = '1';

    const username = decodeURIComponent(m[1]).toLowerCase();
    const users = app.store.all('users') as User[];
    const user = users.find((u) => String(u.username?.() ?? '').toLowerCase() === username);
    if (!user) return;

    // Only decorate if the anchor's visible text actually IS the user's name.
    // This rules out generic-link cases like "You like this", "Reply", or any
    // sentence where the link target happens to be the user's profile but the
    // text is something else entirely. Allows the `@` mention prefix.
    const text = (a.textContent || '').trim().toLowerCase().replace(/^@\s*/, '');
    const dn = String(user.displayName?.() ?? '')
      .trim()
      .toLowerCase();
    const un = String(user.username?.() ?? '')
      .trim()
      .toLowerCase();
    const isName =
      text === dn ||
      text === un ||
      // Allow trailing icons/badges/etc. that get textContent-concatenated.
      (dn && text.startsWith(dn)) ||
      (un && text.startsWith(un));
    if (!isName) return;

    const slug = user.attribute?.('equippedNameDecorationSlug') as string | undefined;
    if (!slug) return;
    const safe = String(slug).replace(/[^a-zA-Z0-9_-]/g, '');
    if (safe) a.classList.add(`ps-name-${safe}`);
  };

  onAdded('a[href*="/u/"]', decorate);
}

// ─── Universal `.username` tagger ────────────────────────────────────────
// Flarum's `username()` helper emits `<span class="username">{name}</span>`
// wherever a user's display name is rendered (post header, mentions, user
// list, etc.) and the span has no inherent user identifier. We find each
// `.username`, walk up to its closest `<a href="/u/{username}">`, look the
// user up in the store, and add `ps-name-{slug}` directly to the span.
//
// This is a defense-in-depth layer: even if a host theme overrides post
// rendering or our `CommentPost.classes()` extension misses an early render
// (subtree.check skipping diff before the user model loads), this scanner
// still applies the decoration once the DOM is in place.
function registerUsernameSpanTagger(): void {
  if (!setting('pointSystem.name_deco_enabled')) return;

  const decorate = (span: Element) => {
    if ((span as HTMLElement).dataset.psNameDeco === '1') return;
    if (isInSecondaryContext(span)) return;

    // Find the closest ancestor anchor pointing at `/u/{username}`.
    let node: Element | null = span;
    let anchor: HTMLAnchorElement | null = null;
    while (node && !anchor) {
      const parent: HTMLElement | null = node.parentElement;
      if (!parent) break;
      if (parent.tagName === 'A' && /\/u\//.test(parent.getAttribute('href') || '')) {
        anchor = parent as HTMLAnchorElement;
      }
      node = parent;
    }
    if (!anchor) return;

    const m = /\/u\/([^/?#]+)/.exec(anchor.getAttribute('href') || '');
    if (!m) return;
    const username = decodeURIComponent(m[1]).toLowerCase();
    const users = app.store.all('users') as User[];
    const user = users.find((u) => String(u.username?.() ?? '').toLowerCase() === username);
    if (!user) return;

    const slug = user.attribute?.('equippedNameDecorationSlug') as string | undefined;
    if (!slug) return;
    const safe = String(slug).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safe) return;

    (span as HTMLElement).dataset.psNameDeco = '1';
    // Also stash the slug so the attribute-observer below can re-apply the
    // class after Mithril rewrites the className during redraws.
    (span as HTMLElement).dataset.psSlug = safe;
    span.classList.add('ps-name-' + safe);
  };

  onAdded('.username', decorate);

  // Re-apply the class whenever Mithril rewrites the className on a tagged
  // `.username`. The vnode for `username()` is just `<span class="username">`,
  // so any redraw of the post stream resets the class to just "username" and
  // strips our `ps-name-X`. Watch for that and put it back.
  onAttributeChange((target, name) => {
    if (name !== 'class') return;
    const el = target as HTMLElement;
    if (el.dataset?.psNameDeco === '1' && el.dataset?.psSlug && !el.classList.contains('ps-name-' + el.dataset.psSlug)) {
      el.classList.add('ps-name-' + el.dataset.psSlug);
    }
  });

  // When the user model lands AFTER its `.username` DOM mounted, the
  // observer doesn't re-fire (the span itself didn't mutate). Two delayed
  // re-scans cover that window without the previous 10× polling churn.
  setTimeout(() => document.querySelectorAll('.username').forEach(decorate), 400);
  setTimeout(() => document.querySelectorAll('.username').forEach(decorate), 1600);
}

// ─── Avocado theme: profile hero hooks ───────────────────────────────────
// Avocado renders its own profile layout (`AvocadoUserPage-hero`) instead of
// using Flarum's UserCard, so our component extensions don't fire here.
// Two DOM-level hooks:
//   1. Inject a points pill into `.AvocadoUserPage-hero-stats`.
//   2. Tag `.AvocadoUserPage-hero-name` (the H1 with the displayName) with
//      `ps-name-{slug}` so the user's equipped name decoration applies.
function registerAvocadoProfileHooks(): void {
  const showPoints = setting('pointSystem.show_in_user_profile');
  const showName = setting('pointSystem.name_deco_enabled') && setting('pointSystem.deco_in_user_card');
  const showCover = setting('pointSystem.cover_deco_enabled');
  const showTitle = setting('pointSystem.title_deco_enabled') && setting('pointSystem.deco_in_user_card');
  if (!showPoints && !showName && !showCover && !showTitle) return;

  const resolveUser = (): User | null => {
    const match = /\/u\/([^/?#]+)/.exec(window.location.pathname);
    if (!match) return null;
    const username = decodeURIComponent(match[1]).toLowerCase();
    const users = app.store.all('users') as User[];
    return users.find((u) => String(u.username?.() ?? '').toLowerCase() === username) || null;
  };

  const injectPoints = (el: Element) => {
    const statsEl = el as HTMLElement;
    if (!showPoints || statsEl.dataset.psPoints === '1') return;
    const user = resolveUser();
    if (!user) return;

    statsEl.dataset.psPoints = '1';
    const balance = Number(user.attribute?.('pointBalance') ?? 0);
    const rawIcon = (app.forum.attribute('pointSystem.currency_icon') as string) || 'fas fa-coins';
    // Strict allowlist on the icon class — only Font Awesome-style tokens.
    const safeIcon = /^[a-zA-Z0-9 _-]{1,80}$/.test(rawIcon) ? rawIcon : 'fas fa-coins';

    const pill = document.createElement('span');
    pill.className = 'AvocadoUserPage-hero-statPill PointSystemProfilePill';
    const iconEl = document.createElement('i');
    iconEl.className = safeIcon;
    iconEl.setAttribute('aria-hidden', 'true');
    pill.appendChild(iconEl);
    pill.appendChild(document.createTextNode(' ' + balance.toLocaleString() + ' ' + pointsLabel(app)));
    statsEl.appendChild(pill);
  };

  const injectCover = (el: Element) => {
    if (!showCover) return;
    const heroEl = el as HTMLElement;
    if (heroEl.dataset.psCover === '1') return;
    const user = resolveUser();
    if (!user) return;
    const coverPath = user.attribute?.('equippedCoverDecorationUrl') as string | undefined;
    if (!coverPath) return;
    const url = resolveAssetUrl(String(coverPath));
    heroEl.dataset.psCover = '1';
    heroEl.classList.add('ps-has-cover');
    heroEl.style.setProperty('--ps-cover-url', `url("${safeCssUrl(url)}")`);
  };

  const tagName = (el: Element) => {
    if (!showName) return;
    const nameEl = el as HTMLElement;
    if (nameEl.dataset.psNameDeco === '1') return;
    const user = resolveUser();
    if (!user) return;
    const slug = user.attribute?.('equippedNameDecorationSlug') as string | undefined;
    if (!slug) return;
    const cleanSlug = String(slug).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanSlug) return;

    // Wrap ONLY the first text node ("Ramon") in our decoration span, leaving
    // the `<span class="VerifiedPopover-anchor">` (and any other sibling
    // element) untouched. If we tagged the h1 directly, CSS color/animation
    // would inherit into the popover, painting the tooltip text too.
    let textNode: Text | null = null;
    for (const child of Array.from(nameEl.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE && (child.textContent || '').trim()) {
        textNode = child as Text;
        break;
      }
    }
    if (!textNode) return;

    nameEl.dataset.psNameDeco = '1';
    const wrapper = document.createElement('span');
    wrapper.className = 'ps-name-text ps-name-' + cleanSlug;
    wrapper.textContent = textNode.textContent;
    textNode.replaceWith(wrapper);
  };

  // Inject the equipped-title chip inline next to the username in Avocado's
  // hero. Our `UserCard.infoItems` extension renders the chip on default
  // Flarum, but Avocado replaces the UserCard with its own hero markup —
  // the infoItems hook still fires (Avocado extends UserCard) but its
  // chip ends up inside a list that Avocado visually relocates, so the
  // chip never lands next to the name. We attach DIRECTLY to the
  // `.AvocadoUserPage-hero-name` H1 instead.
  const injectTitle = (el: Element) => {
    if (!showTitle) return;
    const nameEl = el as HTMLElement;
    if (nameEl.dataset.psTitleChip === '1') return;
    const user = resolveUser();
    if (!user) return;
    const slug = user.attribute?.('equippedTitleDecorationSlug') as string | undefined;
    const text = user.attribute?.('equippedTitleDecorationText') as string | undefined;
    if (!slug || !text) return;
    const cleanSlug = String(slug).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!cleanSlug) return;

    nameEl.dataset.psTitleChip = '1';
    const chip = document.createElement('span');
    chip.className = 'PointSystemUserTitle ps-title-' + cleanSlug + ' PointSystemUserTitle--inProfile';
    // Use textContent (NOT innerHTML) — the title text is user-authored but
    // sanitised server-side; defence-in-depth, never render it as HTML.
    chip.textContent = String(text);
    nameEl.appendChild(chip);
  };

  if (showPoints) onAdded('.AvocadoUserPage-hero-stats', injectPoints);
  if (showName) onAdded('.AvocadoUserPage-hero-name', tagName);
  if (showTitle) onAdded('.AvocadoUserPage-hero-name', injectTitle);
  if (showCover) {
    onAdded('.AvocadoUserPage-hero', injectCover);
    // Also cover Flarum core's UserPage hero (used on default theme + many
    // other themes). UserCard is handled by our `extend(UserCard, 'view')`.
    onAdded('.UserPage .Hero, .UserHero', injectCover);
  }
}

// Push `ps-name-{slug}` onto an array of CSS classes if the user has a
// decoration equipped. Used by the CommentPost.classes() extension where the
// component exposes its class list as an array.
function pushDecoClass(classes: string[], user: User | undefined): void {
  const slug = user?.attribute?.('equippedNameDecorationSlug') as string | undefined;
  if (!slug) return;
  const cleanSlug = String(slug).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleanSlug) return;
  const target = 'ps-name-' + cleanSlug;
  if (!classes.includes(target)) classes.push(target);
}

function pushPostHlClass(classes: string[], user: User | undefined): void {
  const slug = user?.attribute?.('equippedPostHighlightDecorationSlug') as string | undefined;
  if (!slug) return;
  const cleanSlug = String(slug).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleanSlug) return;
  const target = 'ps-posthl-' + cleanSlug;
  if (!classes.includes(target)) classes.push(target);
}

function cssClass(slug: string): string {
  return String(slug).replace(/[^a-zA-Z0-9_-]/g, '');
}

function resolveAssetUrl(path: string): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const base = (app.forum.attribute('assetsBaseUrl') as string | undefined) || (app.forum.attribute('baseUrl') as string) + '/assets';
  return base.replace(/\/+$/, '') + '/' + String(path).replace(/^\/+/, '');
}
