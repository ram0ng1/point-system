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
use Ramon\PointSystem\Model\AvatarDecoration;

/**
 * POST /api/point-system/avatar-decoration/upload (admin only)
 *
 * Multipart fields:
 *   - image: file (png, gif, webp)
 *   - name:  string
 *   - description: string (optional)
 *   - price: int (optional, default 0)
 */
class UploadAvatarDecorationController implements RequestHandlerInterface
{
    private const ALLOWED_EXT = ['png', 'gif', 'webp', 'apng'];
    private const MAX_BYTES   = 4_000_000; // 4MB
    private const DEST_DIR    = 'point-system/avatar-decorations';

    public function __construct(protected Paths $paths) {}

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

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertCan('pointSystem.manage');

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
        $replaceId = isset($body['replace_id']) ? (int) $body['replace_id'] : 0;

        $destDir = $this->paths->public.'/assets/'.self::DEST_DIR;
        if (! is_dir($destDir)) {
            @mkdir($destDir, 0755, true);
        }

        $filename = bin2hex(random_bytes(8)).'.'.$ext;
        $relPath  = self::DEST_DIR.'/'.$filename;
        $destPath = $destDir.'/'.$filename;

        $file->moveTo($destPath);

        // Replace image on an existing decoration — only swap the file fields;
        // name/price/etc are managed via the JSON:API Update endpoint.
        if ($replaceId > 0) {
            $deco = AvatarDecoration::find($replaceId);
            if (! $deco) {
                @unlink($destPath);
                return new JsonResponse(['errors' => [['detail' => 'Decoration not found']]], 404);
            }
            $oldPath = $this->paths->public.'/assets/'.$deco->image_path;
            if (is_file($oldPath) && $oldPath !== $destPath) {
                @unlink($oldPath);
            }
            $deco->image_path = $relPath;
            $deco->is_animated = in_array($ext, ['gif', 'apng'], true);
            $deco->save();
        } else {
            $name = trim((string) ($body['name'] ?? 'Decoration'));
            $description = isset($body['description']) ? trim((string) $body['description']) : null;
            $price = max(0, (int) ($body['price'] ?? 0));

            $deco = AvatarDecoration::create([
                'name' => $name !== '' ? $name : 'Decoration',
                'description' => $description ?: null,
                'image_path' => $relPath,
                'is_animated' => in_array($ext, ['gif', 'apng'], true),
                'price' => $price,
                'is_enabled' => true,
                'sort' => 0,
            ]);
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
            ],
        ]], 201);
    }
}
