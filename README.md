<p align="center">
  <img src="icon.svg" width="80" alt="Point System">
  <h1 align="center">Point System</h1>
</p>

<p align="center">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square">
  <a href="https://packagist.org/packages/ramon/point-system">
    <img alt="Latest Stable Version" src="https://img.shields.io/packagist/v/ramon/point-system.svg?style=flat-square">
  </a>
  <a href="https://packagist.org/packages/ramon/point-system">
    <img alt="Total Downloads" src="https://img.shields.io/packagist/dt/ramon/point-system.svg?style=flat-square">
  </a>
  <a href="https://github.com/ram0ng1/point-system/releases/latest">
    <img alt="GitHub Release" src="https://img.shields.io/github/v/release/ram0ng1/point-system?style=flat-square&label=release&color=success">
  </a>
  <a href="https://donate.stripe.com/fZe5o66nebkf39S28a">
    <img alt="Donate" src="https://img.shields.io/badge/donate-stripe-%236772E5?style=flat-square">
  </a>
</p>

<p align="center">
  A complete gamification system for <a href="https://flarum.org">Flarum</a> — users earn points for activity, spend them on avatar frames, animated username styles and group tiers, with admin tools for catalog management, manual adjustments and tier configuration.
</p>

---

## Features

- **Points by action** — Award points for opening discussions, posting replies, receiving and giving likes, daily logins and sign-ups. Each rule is independently configurable.
- **Two balances** — `lifetime` (total ever earned, never decreases) and `balance` (spendable). Lifetime is hidden via a single toggle if you want a simpler economy.
- **Avatar frames** — Discord-style overlay around the user's avatar. Admins upload PNG / APNG / GIF / WebP frames; the frame applies wherever the avatar is rendered (post header, profile hero, discussion list, replies, themes like Avocado).
- **Username decorations** — 24 built-in presets (gold, rainbow, neon, fire, ice, glitch, shine, galaxy, breath, royal, matrix, typewriter, mercury, hue-cycle, blur, lightning, underline, toxic, vhs, glass, stamp, hearts, sparkle, wave) plus a free-form CSS editor with `&` as the selector placeholder and `@keyframes` support.
- **Group tiers** — Buy permanent group membership with points. Admin sets the cost; the system attaches the user to the group on claim.
- **Live preview everywhere** — Decorations preview in the shop, in the admin form, on the user's profile and in the post stream — both on Flarum's default theme and on the Avocado theme.
- **Manage-points modal** — Admin opens any user's profile → Controls → *Manage points* → add or remove an amount, with an optional reason that surfaces in the notification.
- **Notifications** — Users receive an in-app (and websocket-pushed if `kyrne/websocket` is installed) notification when an admin credits/debits their points, and when they join a tier group.
- **Users panel** — Admin page listing every user with balance, lifetime totals and current groups. Search, paginate, filter by "with balance" / "zero balance" / "all", sort by any column.
- **Hide badges with frame** — Optional setting: when a user has an avatar decoration equipped, suppress their mod/admin group badges so the frame stays visually clean.

## Requirements

- Flarum `^2.0.0`
- *(optional)* `flarum/likes` — enables like-related point awards
- *(optional)* `kyrne/websocket` — pushes notifications in real time

## Installation

```sh
composer require ramon/point-system
php flarum migrate
php flarum cache:clear
php flarum assets:publish
```

Then enable **Point System** under the *Extensions* page in the admin panel.

## Updating

```sh
composer update ramon/point-system --with-dependencies
php flarum migrate
php flarum cache:clear
```

## Configuration

All settings live in **Admin → Extensions → Point System → Points & Rules**.

| Setting | Description | Default |
|---|---|---|
| Enable point system | Master switch — when off, no points are awarded | `true` |
| Enable auto-group tiers | Lets users buy group membership with points | `true` |
| Track and show lifetime points | When off, the lifetime totals stay tracked internally but are hidden from the UI | `true` |
| Enable avatar frames | Master toggle for avatar decorations | `true` |
| Enable username decorations | Master toggle for name decorations | `true` |
| Decorations in post stream | Apply decorations on the post header username | `true` |
| Decorations on user card / profile | Apply decorations on the profile card and the avocado hero | `true` |
| Decorations in discussion lists | Apply decorations in discussion lists and avocado thread cards | `true` |
| Show points in post header | Show the user's balance as a chip next to the post-header username | `true` |
| Show points on user profile | Show the balance pill on the user profile / user card | `true` |
| Hide user badges when avatar frame is equipped | Suppress mod/admin badges next to decorated avatars | `false` |
| Currency name | Plural label for the points (e.g. `Coins`, `Gems`) | `Points` |
| Currency icon class | FontAwesome class for the points icon | `fas fa-coins` |
| Points per new discussion | Awarded to the author when they open a new discussion | `10` |
| Points per reply | Awarded for each non-OP post the user publishes | `5` |
| Points per like received | Awarded to the author when a post is liked | `2` |
| Points per like given | Awarded to the liker (encourages engagement) | `1` |
| Sign-up bonus | Awarded once when a user registers | `50` |
| Daily login bonus | Awarded the first time a user is seen each day | `5` |

## Permissions

- **View rewards** (`pointSystem.viewShop`) — who can open the Rewards page. Hidden from the sidebar nav otherwise; direct URL returns a 404.
- **Claim rewards** (`pointSystem.claim`) — who can spend points in the shop.
- **View other users' points** (`pointSystem.viewOthers`) — who can see balances of users other than themselves. The PermissionGrid surfaces an `Everyone` option so you can grant this to guests.
- **Manage the point system** (`pointSystem.manage`) — full admin access (manage catalog, manage tiers, award/revoke points).

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/point-system/claim/{id}` | Spend points to claim a shop item; idempotent (re-claim returns the existing claim) |
| `POST` | `/api/point-system/tier-claim` | Buy permanent group membership |
| `POST` | `/api/point-system/equip` | Equip an owned decoration |
| `POST` | `/api/point-system/unequip` | Unequip the current decoration of a type |
| `POST` | `/api/point-system/avatar-decoration/upload` | Upload a new avatar frame (admin) — also handles replace-image |
| `DELETE` | `/api/point-system/avatar-decoration/{id}` | Delete an avatar frame + its file on disk (admin) |
| `POST` | `/api/point-system/award` | Manually credit or debit a user's points (admin) |

JSON:API resources are also exposed for `point-system-avatar-decorations`, `point-system-name-decorations`, `point-system-auto-group-tiers`, `point-system-shop-items` and `point-system-claims`.

## Events

The extension fires the following events that other extensions can listen to:

- `Ramon\PointSystem\Event\PointsAwarded` — fired on every credit/debit
- `Ramon\PointSystem\Event\PointsManuallyChanged` — fired only on admin manual adjustments
- `Ramon\PointSystem\Event\TierClaimed` — fired when a user joins a tier group

## Links

- [GitHub](https://github.com/ram0ng1/point-system)
- [Issues](https://github.com/ram0ng1/point-system/issues)
- [Donate](https://donate.stripe.com/fZe5o66nebkf39S28a)

## Authors

- [Ramon Guilherme](https://ramonguilherme.com.br)

## License

[MIT](LICENSE)
