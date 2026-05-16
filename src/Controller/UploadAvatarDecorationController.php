<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Controller;

use Flarum\Foundation\Paths;
use Flarum\Http\RequestUtil;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Message\UploadedFileInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\PointSystem\FeatureGate;
use Ramon\PointSystem\Model\AvatarDecoration;
use Ramon\PointSystem\Model\ShopClaim;
use Ramon\PointSystem\Support\SafePath;

/**
 * POST /api/point-system/avatar-decoration/upload
 *
 * Two entry modes share this controller so the upload pipeline (size /
 * extension / magic-byte / finfo / SafePath cleanup) only lives in one place:
 *
 *   • Manager (pointSystem.manage permission) — full admin upload.
 *     Accepts `replace_id` to swap an existing decoration's file. New rows
 *     are created enabled (`is_enabled=true`, `status=approved`).
 *   • User submission — non-manager actor when `user_submissions_enabled`
 *     is on. `replace_id` is ignored; rows land as
 *     `is_enabled=false / status=pending / creator_id=actor / price=0` and
 *     wait for the moderation queue.
 *
 * Multipart fields:
 *   - image: file (png, gif, webp, apng)
 *   - name:  string
 *   - description: string (optional)
 *   - price: int (manager only; ignored for user submissions)
 *   - replace_id: int (manager only)
 */
class UploadAvatarDecorationController implements RequestHandlerInterface
{
    private const ALLOWED_EXT = ['png', 'gif', 'webp', 'apng'];
    private const MAX_BYTES   = 4_000_000; // 4MB
    private const DEST_DIR    = 'point-system/avatar-decorations';

    private const ALLOWED_MIMES = [
        'png'  => ['image/png'],
        'apng' => ['image/png', 'image/apng'],
        'gif'  => ['image/gif'],
        'webp' => ['image/webp'],
    ];

    public function __construct(
        protected Paths $paths,
        protected FeatureGate $features,
    ) {}

    /**
     * Check whether the first bytes of the uploaded stream match the declared
     * extension. Catches polyglot payloads (a `.gif`-named file whose body is
     * actually `<?php ...`).
     */
    protected function signatureMatches(string $head, string $ext): bool
    {
        // PNG: 89 50 4E 47 0D 0A 1A 0A
        if ($ext === 'png' || $ext === 'apng') {
            return str_starts_with($head, "\x89PNG\r\n\x1a\n");
        }
        // GIF: GIF87a / GIF89a
        if ($ext === 'gif') {
            return str_starts_with($head, 'GIF87a') || str_starts_with($head, 'GIF89a');
        }
        // WebP: RIFF????WEBP
        if ($ext === 'webp') {
            return str_starts_with($head, 'RIFF') && substr($head, 8, 4) === 'WEBP';
        }
        return false;
    }

    #[\Override]
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertRegistered();
        $this->features->assertEnabled(ShopClaim::TYPE_AVATAR);

        $isManager = $actor->hasPermission('pointSystem.manage');
        if (! $isManager) {
            // Non-manager path is gated behind the user-submissions toggle.
            // When the admin has it off, fall back to the original behavior:
            // upload requires the manage permission.
            $this->features->assertUserSubmissionsEnabled();
        }

        $files = $request->getUploadedFiles();
        $file  = $files['image'] ?? null;
        if (! $file instanceof UploadedFileInterface || $file->getError() !== UPLOAD_ERR_OK) {
            return new JsonResponse(['errors' => [['detail' => 'No image uploaded']]], 422);
        }
        if ($file->getSize() > self::MAX_BYTES) {
            return new JsonResponse(['errors' => [['detail' => 'File too large (max 4MB)']]], 413);
        }

        $original = (string) $file->getClientFilename();
        $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
        if (! in_array($ext, self::ALLOWED_EXT, true)) {
            return new JsonResponse(['errors' => [['detail' => 'Only PNG, GIF, WebP, APNG allowed']]], 422);
        }

        // Magic-byte check on the actual stream: defeats polyglots that name
        // themselves `.gif` but ship as a PHP payload. We sniff the first
        // bytes and require they match the declared extension.
        $stream = $file->getStream();
        $stream->rewind();
        $head = (string) $stream->read(16);
        $stream->rewind();
        if (! $this->signatureMatches($head, $ext)) {
            return new JsonResponse(['errors' => [['detail' => 'File content does not match its extension']]], 422);
        }

        $body = (array) $request->getParsedBody();
        // replace_id is a manager-only privilege: it swaps the file on an
        // existing row in place. Regular submitters can only create new
        // pending rows — anything else would let them tamper with an
        // already-approved decoration.
        $replaceId = $isManager && isset($body['replace_id']) ? (int) $body['replace_id'] : 0;

        $destDir = $this->paths->public.'/assets/'.self::DEST_DIR;
        if (! is_dir($destDir)) {
            @mkdir($destDir, 0755, true);
        }

        $filename = bin2hex(random_bytes(8)).'.'.$ext;
        $relPath  = self::DEST_DIR.'/'.$filename;
        $destPath = $destDir.'/'.$filename;

        $file->moveTo($destPath);

        // §11 defense-in-depth: re-detect the content MIME via finfo after the
        // upload settled on disk. The earlier magic-byte sniff catches naive
        // polyglots, but finfo is the canonical CLAUDE.md check — and running
        // it on the persisted file (not the stream) closes the gap where a
        // moveTo() implementation might fail silently on a corrupted upload.
        $detected = @mime_content_type($destPath) ?: '';
        $allowedMimes = self::ALLOWED_MIMES[$ext] ?? [];
        if (! in_array($detected, $allowedMimes, true)) {
            @unlink($destPath);
            return new JsonResponse(['errors' => [['detail' => 'File MIME does not match its extension']]], 422);
        }

        // Replace image on an existing decoration — only swap the file fields;
        // name/price/etc are managed via the JSON:API Update endpoint.
        if ($replaceId > 0) {
            $deco = AvatarDecoration::find($replaceId);
            if (! $deco) {
                @unlink($destPath);
                return new JsonResponse(['errors' => [['detail' => 'Decoration not found']]], 404);
            }
            // §13: confine the unlink target inside the assets dir. If the DB
            // somehow holds a `../config.php`-style path, SafePath returns
            // null and we just skip the delete — never touching anything
            // outside the configured base.
            $oldPath = SafePath::confine($this->paths->public.'/assets', (string) $deco->image_path);
            if ($oldPath !== null && $oldPath !== $destPath && is_file($oldPath)) {
                @unlink($oldPath);
            }
            $deco->image_path = $relPath;
            $deco->is_animated = in_array($ext, ['gif', 'apng'], true);
            $deco->save();
        } else {
            $name = trim((string) ($body['name'] ?? 'Decoration'));
            $description = isset($body['description']) ? trim((string) $body['description']) : null;

            $attrs = [
                'name' => $name !== '' ? $name : 'Decoration',
                'description' => $description ?: null,
                'image_path' => $relPath,
                'is_animated' => in_array($ext, ['gif', 'apng'], true),
                'sort' => 0,
            ];

            if ($isManager) {
                $attrs['price']      = max(0, (int) ($body['price'] ?? 0));
                $attrs['is_enabled'] = true;
                $attrs['status']     = AvatarDecoration::STATUS_APPROVED;
            } else {
                // User submission: forced into the moderation queue. The
                // actor decides the name/description/image; admin-only
                // fields (price, listing, group restrictions, dates) are
                // server-derived and locked. Reviewer can flip is_enabled
                // once they approve from the admin queue.
                $attrs['price']      = 0;
                $attrs['is_enabled'] = false;
                $attrs['status']     = AvatarDecoration::STATUS_PENDING;
                $attrs['creator_id'] = (int) $actor->id;
            }

            $deco = AvatarDecoration::create($attrs);
        }

        return new JsonResponse(['data' => [
            'type' => 'point-system-avatar-decorations',
            'id' => (string) $deco->id,
            'attributes' => [
                'name' => $deco->name,
                'description' => $deco->description,
                'imagePath' => $deco->image_path,
                'isAnimated' => $deco->is_animated,
                'price' => $deco->price,
                'isEnabled' => $deco->is_enabled,
                'status' => $deco->status,
            ],
        ]], 201);
    }
}
