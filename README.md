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

<p align="center">Points, frames and flair. A small economy for your Flarum community.</p>

Point System turns activity into currency. Users earn points for posting, getting likes, logging in and signing up, then spend them in a shop on avatar frames, username styles, profile covers, titles and post highlights. Admins control the catalog, the prices and every earning rule.

It scales with how much you want to run. Keep it to a simple earn and spend loop, or open the whole thing up: let users design and submit their own decorations for approval, let them trade items and points with each other, put stock limits and sale windows on the catalog, and sell permanent group access alongside it.

## What it does

- Points for discussions, replies, likes given and received, daily logins and sign ups, each rule configurable
- Two balances per user: lifetime earned and spendable, with lifetime optionally hidden
- Five decoration families — avatar frames, username styles, profile covers, titles and post highlights — each with its own master switch
- 25 built in username styles and 10 post highlight presets, plus a free form CSS editor with keyframes when you want your own
- Group tiers unlocked automatically at a lifetime threshold, bought outright with points, or both
- Player to player trading of items and points, with both sides required to accept and an admin dashboard that can revert a completed trade
- User submitted decorations with an admin moderation queue, so the catalog can grow without you drawing every frame
- Stock limits, sale windows and per group restrictions on any shop item
- Admin tools for manual credit and debit with reasons, plus a bulk award to every user at once
- Notifications when points change, a tier is joined, an item is granted or a trade moves, websocket pushed if `flarum/realtime` is around
- Plays nice with `flarum/gdpr` for export, anonymization and erasure

## Installation

```sh
composer require ramon/point-system
php flarum migrate
php flarum cache:clear
```

Enable Point System on the Extensions page. Rules, catalog, tiers, the moderation queue and permissions are all managed in the admin panel, each option explained in place.

Optional companions: `flarum/likes` unlocks the like related rules, `flarum/realtime` makes notifications land instantly, and `flarum/gdpr` wires points and trades into data export and erasure.

## Good to know

- Users get three pages: `/rewards` to spend, `/decorations` to equip what they own, and `/trades` for exchanges. All three respect permissions, so you can open the shop to everyone and keep trading to a single group.
- Custom CSS on decorations is sanitized twice, on save and again on output. An allowlist strips the primitives that break out of a stylesheet, and it runs on serialization too, so rows written before the hardening are neutralized without a backfill.
- Points never move outside a transaction. Claiming, trading and manual adjustments all commit or roll back as a unit, so a failure mid flow cannot leave a balance debited with nothing delivered.
- Everything the frontend does goes through the `/api/point-system/*` endpoints, and seven events fire on every change, so other extensions can react or drive the economy from outside.

## License

[MIT](LICENSE.md). Suggestions and bug reports go in the [issue tracker](https://github.com/ram0ng1/point-system/issues).
