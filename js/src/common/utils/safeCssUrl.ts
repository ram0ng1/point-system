/**
 * Escapes a URL for safe interpolation into a CSS `url("...")` string.
 *
 * The browser CSSOM would accept percent-encoded characters but a naive
 * `replace(/"/g, '%22')` leaves `)`, `;`, `{`, `}` unescaped — any of those
 * inside an admin-pasted image URL would break out of the CSS string and
 * inject arbitrary declarations.
 */
export function safeCssUrl(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\\/g, '%5C')
    .replace(/"/g, '%22')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/;/g, '%3B')
    .replace(/\{/g, '%7B')
    .replace(/\}/g, '%7D')
    .replace(/\r/g, '')
    .replace(/\n/g, '');
}
