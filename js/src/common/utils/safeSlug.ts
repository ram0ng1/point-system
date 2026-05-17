/**
 * Strips any character that wouldn't survive as a CSS class fragment. Used
 * everywhere a slug from server data lands in a `ps-name-${x}` / `ps-posthl-${x}`
 * className — the regex pattern was duplicated 30+ times before.
 */
export function safeSlug(raw: unknown): string {
  return String(raw ?? '').replace(/[^a-zA-Z0-9_-]/g, '');
}
