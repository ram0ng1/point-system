<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Controller;

use Flarum\Http\RequestUtil;
use Illuminate\Contracts\Filesystem\Factory as FilesystemFactory;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Message\UploadedFileInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\PointSystem\FeatureGate;
use Ramon\PointSystem\Model\AvatarDecoration;
use Ramon\PointSystem\Model\ShopClaim;

/**
 * POST /api/point-system/avatar-decoration/upload
 *
 * Two entry modes share this controller so the upload pipeline (size /
 * extension / magic-byte / finfo / flarum-assets disk write) only lives in
 * one place:
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
        protected FilesystemFactory $filesystem,
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
        // PSR-7 permits getSize() returning null for chunked uploads with no
        // Content-Length header; null > MAX would silently bypass the cap.
        $size = $file->getSize();
        if ($size === null || $size <= 0 || $size > self::MAX_BYTES) {
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

        // Buffer the upload once. The magic-byte sniff above caught naive
        // polyglots; finfo on the actual bytes closes the gap. finfo_buffer
        // keeps the check off-disk — nothing is persisted until it passes.
        $stream->rewind();
        $contents = $stream->getContents();

        $detected = '';
        if (function_exists('finfo_open')) {
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            if ($finfo) {
                $detected = (string) (finfo_buffer($finfo, $contents) ?: '');
                finfo_close($finfo);
            }
        }
        $allowedMimes = self::ALLOWED_MIMES[$ext] ?? [];
        if (! in_array(strtolower($detected), $allowedMimes, true)) {
            return new JsonResponse(['errors' => [['detail' => 'File MIME does not match its extension']]], 422);
        }

        // Persist through the flarum-assets disk (rooted at public/assets).
        // The Flysystem local adapter creates the subdirectory, applies
        // public (web-readable) visibility, and prefix-confines the path —
        // a relative path can never escape the assets root (CLAUDE.md §54).
        $disk     = $this->filesystem->disk('flarum-assets');
        $filename = bin2hex(random_bytes(8)).'.'.$ext;
        $relPath  = self::DEST_DIR.'/'.$filename;
        $disk->put($relPath, $contents, 'public');

        // Replace image on an existing decoration — only swap the file fields;
        // name/price/etc are managed via the JSON:API Update endpoint.
        if ($replaceId > 0) {
            $deco = AvatarDecoration::find($replaceId);
            if (! $deco) {
                $disk->delete($relPath);
                return new JsonResponse(['errors' => [['detail' => 'Decoration not found']]], 404);
            }
            // Drop the previous file. delete() is idempotent, and the local
            // adapter rejects a traversal path with an exception rather than
            // escaping the assets root — swallow it so a malformed legacy
            // image_path can never abort the swap.
            $oldPath = (string) $deco->image_path;
            if ($oldPath !== '' && $oldPath !== $relPath) {
                try {
                    $disk->delete($oldPath);
                } catch (\Throwable) {
                }
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
