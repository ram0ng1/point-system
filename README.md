<p align="center">
  <img src="icon.svg" width="80" height="80" alt="Point System">
</p>

<h1 align="center">Point System</h1>

<p align="center">
  <a href="https://github.com/ram0ng1/point-system/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/ram0ng1/point-system/ci.yml?branch=main&style=flat-square&label=ci"></a>
  <a href="https://packagist.org/packages/ramon/point-system"><img alt="Packagist" src="https://img.shields.io/packagist/v/ramon/point-system?style=flat-square&label=packagist"></a>
  <a href="https://packagist.org/packages/ramon/point-system"><img alt="Downloads" src="https://img.shields.io/packagist/dt/ramon/point-system?style=flat-square"></a>
  <img alt="Flarum" src="https://img.shields.io/badge/flarum-2.x-e7672e?style=flat-square">
  <a href="LICENSE.md"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"></a>
  <a href="https://donate.stripe.com/fZe5o66nebkf39S28a"><img alt="Donate" src="https://img.shields.io/badge/donate-stripe-6772E5?style=flat-square"></a>
</p>

<p align="center">Points, frames and flair. Gamification for Flarum 2.</p>

Point System turns activity into a small economy. Users earn points for posting, getting likes, logging in and signing up, then spend them on avatar frames, animated username styles and permanent group tiers. Admins control the catalog, the prices and every earning rule.

There are 24 built in username decorations, from gold and neon to glitch and rainbow, plus a free form CSS editor with keyframes support when you want to design your own. Everything previews live before anyone spends a point.

## What it does

- Points for discussions, replies, likes given and received, daily logins and sign ups, each rule configurable
- Two balances per user: lifetime earned and spendable, with lifetime optionally hidden
- Avatar frames in PNG, APNG, GIF or WebP, rendered everywhere the avatar appears
- Username decorations with live preview in the shop, in the admin form and in the post stream
- Group tiers purchasable with points, attached permanently on claim
- Admin tools for manual credit and debit with reasons, plus a users panel with search and sorting
- Notifications when points change or a tier is joined, websocket pushed if `flarum/realtime` is around
- Events fired on every change, so other extensions can react

## Installation

```sh
composer require ramon/point-system
php flarum migrate
php flarum cache:clear
```

Enable Point System on the Extensions page. Rules, catalog, tiers and permissions are all managed in the admin panel.

Optional companions: `flarum/likes` unlocks the like related rules and `flarum/realtime` makes notifications land in real time.

## License

[MIT](LICENSE.md). Suggestions and bug reports go in the [issue tracker](https://github.com/ram0ng1/point-system/issues).
