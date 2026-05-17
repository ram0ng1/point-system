// Resolves the configurable "points unit" suffix admins set in the dashboard
// (defaults to "pts"). Centralized so every "12 pts" / "5 pts" call site stays
// in sync — the literal "pts" string was scattered across 10+ files before.
//
// Accepts either `flarum/forum/app` or `flarum/admin/app` so it's usable from
// both bundles.
export function pointsLabel(app: any): string {
  const raw = app?.forum?.attribute?.('pointSystem.points_short');
  return (typeof raw === 'string' && raw.trim()) || 'pts';
}

/**
 * Format an amount + the configured unit, e.g. `formatPoints(app, 1234) → "1,234 pts"`.
 */
export function formatPoints(app: any, amount: number): string {
  return `${Number(amount || 0).toLocaleString()} ${pointsLabel(app)}`;
}
