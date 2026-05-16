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
use Ramon\PointSystem\Model\CoverDecoration;
use Ramon\PointSystem\Model\ShopClaim;
use Ramon\PointSystem\Support\SafePath;

/**
 * POST /api/point-system/cover-decoration/upload
 *
 * Two entry modes share this controller, mirroring the avatar uploader:
 *
 *   • Manager (pointSystem.manage) — full admin upload, accepts `replace_id`,
 *     new rows ship enabled + approved.
 *   • User submission — non-manager actor when `user_submissions_enabled` is
 *     on. `replace_id` is ignored; rows land as pending / disabled / price 0
 *     with creator_id set to the submitter. Reviewer approves via the queue.
 *
 * Multipart fields:
 *   - image:        file (png, jpg, gif, webp, apng)
 *   - name:         string
 *   - description:  string (optional)
 *   - price:        int (manager only)
 *   - replace_id:   int (manager only)
 *
 * Covers are landscape banners (similar to forumaker/profile-cover). We allow
 * animated formats (GIF/APNG/WebP) so admins can ship animated covers for sale.
 */
class UploadCoverDecorationController implements RequestHandlerInterface
{
    private const ALLOWED_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'apng'];
    private const MAX_BYTES   = 6_000_000; // 6MB — covers are larger than avatars
    private const DEST_DIR    = 'point-system/cover-decorations';

    private const ALLOWED_MIMES = [
        'png'  => ['image/png'],
        'apng' => ['image/png', 'image/apng'],
        'gif'  => ['image/gif'],
        'webp' => ['image/webp'],
        'jpg'  => ['image/jpeg'],
        'jpeg' => ['image/jpeg'],
    ];

    public function __construct(
        protected Paths $paths,
        protected FeatureGate $features,
    ) {}

    protected function signatureMatches(string $head, string $ext): bool
    {
        if ($ext === 'png' || $ext === 'apng') {
            return str_starts_with($head, "\x89PNG\r\n\x1a\n");
        }
        if ($ext === 'gif') {
            return str_starts_with($head, 'GIF87a') || str_starts_with($head, 'GIF89a');
        }
        if ($ext === 'webp') {
            return str_starts_with($head, 'RIFF') && substr($head, 8, 4) === 'WEBP';
        }
        if ($ext === 'jpg' || $ext === 'jpeg') {
            return str_starts_with($head, "\xff\xd8\xff");
        }
        return false;
    }

    #[\Override]
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertRegistered();
        $this->features->assertEnabled(ShopClaim::TYPE_COVER);

        $isManager = $actor->hasPermission('pointSystem.manage');
        if (! $isManager) {
            $this->features->assertUserSubmissionsEnabled();
        }

        $files = $request->getUploadedFiles();
        $file  = $files['image'] ?? null;
        if (! $file instanceof UploadedFileInterface || $file->getError() !== UPLOAD_ERR_OK) {
            return new JsonResponse(['errors' => [['detail' => 'No image uploaded']]], 422);
        }
        if ($file->getSize() > self::MAX_BYTES) {
            return new JsonResponse(['errors' => [['detail' => 'File too large (max 6MB)']]], 413);
        }

        $original = (string) $file->getClientFilename();
        $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
        if (! in_array($ext, self::ALLOWED_EXT, true)) {
            return new JsonResponse(['errors' => [['detail' => 'Only PNG, JPG, GIF, WebP, APNG allowed']]], 422);
        }

        $stream = $file->getStream();
        $stream->rewind();
        $head = (string) $stream->read(16);
        $stream->rewind();
        if (! $this->signatureMatches($head, $ext)) {
            return new JsonResponse(['errors' => [['detail' => 'File content does not match its extension']]], 422);
        }

        $body = (array) $request->getParsedBody();
        // Manager-only privilege — see UploadAvatarDecorationController for
        // the threat-model rationale. Submitters can only create new pending
        // rows, never tamper with an existing approved cover.
        $replaceId = $isManager && isset($body['replace_id']) ? (int) $body['replace_id'] : 0;

        $destDir = $this->paths->public.'/assets/'.self::DEST_DIR;
        if (! is_dir($destDir)) {
            @mkdir($destDir, 0755, true);
        }

        $filename = bin2hex(random_bytes(8)).'.'.$ext;
        $relPath  = self::DEST_DIR.'/'.$filename;
        $destPath = $destDir.'/'.$filename;

        $file->moveTo($destPath);

        // §11 defense-in-depth: re-detect MIME via finfo after persistence.
        $detected = @mime_content_type($destPath) ?: '';
        $allowedMimes = self::ALLOWED_MIMES[$ext] ?? [];
        if (! in_array($detected, $allowedMimes, true)) {
            @unlink($destPath);
            return new JsonResponse(['errors' => [['detail' => 'File MIME does not match its extension']]], 422);
        }

        if ($replaceId > 0) {
            $deco = CoverDecoration::find($replaceId);
            if (! $deco) {
                @unlink($destPath);
                return new JsonResponse(['errors' => [['detail' => 'Cover not found']]], 404);
            }
            // §13: confine unlink target inside the assets dir.
            $oldPath = SafePath::confine($this->paths->public.'/assets', (string) $deco->image_path);
            if ($oldPath !== null && $oldPath !== $destPath && is_file($oldPath)) {
                @unlink($oldPath);
            }
            $deco->image_path = $relPath;
            $deco->is_animated = in_array($ext, ['gif', 'apng', 'webp'], true);
            $deco->save();
        } else {
            $name = trim((string) ($body['name'] ?? 'Cover'));
            $description = isset($body['description']) ? trim((string) $body['description']) : null;

            $attrs = [
                'name' => $name !== '' ? $name : 'Cover',
                'description' => $description ?: null,
                'image_path' => $relPath,
                'is_animated' => in_array($ext, ['gif', 'apng', 'webp'], true),
                'sort' => 0,
            ];

            if ($isManager) {
                $attrs['price']      = max(0, (int) ($body['price'] ?? 0));
                $attrs['is_enabled'] = true;
                $attrs['status']     = CoverDecoration::STATUS_APPROVED;
            } else {
                // User submission — locked into the moderation pipeline.
                $attrs['price']      = 0;
                $attrs['is_enabled'] = false;
                $attrs['status']     = CoverDecoration::STATUS_PENDING;
                $attrs['creator_id'] = (int) $actor->id;
            }

            $deco = CoverDecoration::create($attrs);
        }

        return new JsonResponse(['data' => [
            'type' => 'point-system-cover-decorations',
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
