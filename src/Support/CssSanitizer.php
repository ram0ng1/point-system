<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Support;

/**
 * Single source of truth for sanitizing admin-authored CSS fragments that
 * land in a `<style>` block on every forum page.
 *
 * Applied on WRITE inside each decoration resource AND on EMIT inside
 * {@see \Ramon\PointSystem\Api\ForumAttributes}. The double pass is
 * deliberate per CLAUDE.md §21: a single `</style><script>...` bypass
 * would be RCE-grade, and an admin account compromise is part of the
 * threat model — re-running the allowlist on serialization means any
 * value already in the database that pre-dates this hardening is also
 * neutralized when emitted, without a backfill migration.
 *
 * Strategy:
 *   1. Cap length.
 *   2. Normalize CSS hex escapes (`\69mport` → `import`) so the rest of
 *      the regex blocklist can't be bypassed by escape encoding.
 *   3. Strip the obvious markup-break and script-eval primitives.
 *   4. Block `position: fixed/sticky` and `display: none` on broad
 *      selectors — those are the building blocks of overlay phishing.
 *   5. Drop @-rules other than the explicitly-allowed `@keyframes` /
 *      `@-webkit-keyframes`. Kills `@import`, `@charset`, `@namespace`,
 *      `@font-face` (which can leak via download URL), etc.
 */
class CssSanitizer
{
    public const MAX_LENGTH = 4000;

    public static function sanitize(?string $css): ?string
    {
        if ($css === null) {
            return null;
        }

        $css = mb_substr($css, 0, self::MAX_LENGTH);

        $css = preg_replace_callback(
            '/\\\\([0-9a-fA-F]{1,6})\s?/',
            fn ($m) => chr(hexdec($m[1]) & 0x7f),
            $css,
        );

        $css = preg_replace('#</\s*style#i', '', $css);
        $css = preg_replace('#<\s*script#i', '', $css);
        $css = preg_replace('#expression\s*\(#i', '', $css);
        $css = preg_replace('#behavior\s*:#i', '', $css);
        $css = preg_replace('#-moz-binding\s*:#i', '', $css);
        $css = preg_replace('#url\s*\(\s*[\'"]?\s*javascript:#i', 'url(', $css);
        $css = preg_replace('#url\s*\(\s*[\'"]?\s*data:#i', 'url(', $css);

        $css = preg_replace('#position\s*:\s*fixed#i', 'position:static', $css);
        $css = preg_replace('#position\s*:\s*sticky#i', 'position:static', $css);
        $css = preg_replace('#display\s*:\s*none#i', '', $css);

        $css = preg_replace_callback(
            '/@-?(?:webkit-|moz-|ms-|o-)?([a-zA-Z][a-zA-Z0-9_-]*)/i',
            function ($m) {
                $name = strtolower($m[1]);
                return $name === 'keyframes' ? $m[0] : '';
            },
            $css,
        );

        return (string) $css;
    }
}
