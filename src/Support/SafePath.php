<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Support;

/**
 * Filesystem-path confinement helpers used by the decoration upload/delete
 * controllers. Centralizing the logic here keeps the §13 defense (realpath +
 * prefix check) consistent across every file-system mutation site.
 */
final class SafePath
{
    /**
     * Resolve `$base . '/' . $relPath` to an absolute path, returning it only
     * when the resolved target lies strictly within `$base`. Returns null on:
     *   - a `$relPath` that isn't a valid filename (`../`, leading `/`, etc.)
     *   - a `realpath()` outcome outside `$base`
     *   - a target that doesn't exist (callers expect the path to be deletable)
     *
     * `$base` must be a path that already exists; the function realpath()'s it
     * once to anchor the prefix check.
     */
    public static function confine(string $base, string $relPath): ?string
    {
        $baseReal = realpath($base);
        if ($baseReal === false) {
            return null;
        }

        if ($relPath === '' || !preg_match('#^[A-Za-z0-9._/-]+$#', $relPath)) {
            return null;
        }
        if (str_contains($relPath, '..') || str_starts_with($relPath, '/') || str_starts_with($relPath, '\\')) {
            return null;
        }

        $candidate = $baseReal.DIRECTORY_SEPARATOR.str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $relPath);
        $resolved  = realpath($candidate);
        if ($resolved === false) {
            return null;
        }

        $prefix = rtrim($baseReal, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR;
        return str_starts_with($resolved, $prefix) ? $resolved : null;
    }
}
