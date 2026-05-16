<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Support;

/**
 * Validates a remote image URL pasted by an admin into a decoration form.
 *
 * Threat surface — the URL is:
 *   1. Stored on the decoration row, then exposed in every public forum
 *      payload via the equipped-decoration attribute.
 *   2. Rendered into `<img src="...">` in user browsers.
 *
 * Browsers do NOT execute scripts inside `<img src="...">`, even when the
 * URL resolves to SVG (the image-mode renderer sandboxes the document and
 * blocks `<script>` and `<foreignObject>` script handlers). What we DO need
 * to defend against:
 *
 *   - `javascript:` / `data:` / `file:` / unusual schemes — anti-confusion,
 *     anti-mXSS-via-data-URL-misclassification, anti-LFI-via-`file:`.
 *   - URLs that aren't valid absolute URLs.
 *   - URLs too long for the column (1024 chars).
 *
 * We deliberately do NOT validate that the URL actually resolves to an
 * image at upload time — the admin is responsible for the URL they paste,
 * and a runtime image-load failure surfaces a broken-image icon, not a
 * security issue. We also do not block private/internal IPs here because
 * the server itself never fetches this URL (the user's browser does, with
 * the user's own network reachability).
 *
 * This is §47 territory: an admin-controlled execution surface gated on
 * input validation. CLAUDE.md §14 (SSRF) does not apply because no server-
 * side fetch happens.
 *
 * Returns the canonical URL on success, or null on rejection.
 */
final class RemoteImageUrl
{
    private const MAX_LENGTH = 1024;
    private const ALLOWED_SCHEMES = ['http', 'https'];

    public static function validate(string $url): ?string
    {
        $url = trim($url);
        if ($url === '' || strlen($url) > self::MAX_LENGTH) {
            return null;
        }

        // Reject obvious bad-scheme inputs before parse_url (which is
        // permissive about garbage). Catches `javascript:`, `data:`,
        // `vbscript:`, `file:`, `ftp:`, plus weird prefixes like `\\srv`.
        if (! preg_match('#^https?://#i', $url)) {
            return null;
        }

        $parts = parse_url($url);
        if (! is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
            return null;
        }

        $scheme = strtolower((string) $parts['scheme']);
        if (! in_array($scheme, self::ALLOWED_SCHEMES, true)) {
            return null;
        }

        $host = (string) $parts['host'];
        // Defensive: reject hostnames that contain literal control chars or
        // whitespace (FILTER_VALIDATE_URL itself misses some of these).
        if (preg_match('/\s|[\x00-\x1f]/', $host) === 1) {
            return null;
        }

        // FILTER_VALIDATE_URL is best-effort but catches the long tail of
        // malformed inputs (missing host, embedded newlines, etc.).
        if (filter_var($url, FILTER_VALIDATE_URL) === false) {
            return null;
        }

        return $url;
    }
}
