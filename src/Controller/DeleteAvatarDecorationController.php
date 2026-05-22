<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Controller;

use Flarum\Http\RequestUtil;
use Illuminate\Contracts\Filesystem\Factory as FilesystemFactory;
use Laminas\Diactoros\Response\EmptyResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\PointSystem\FeatureGate;
use Ramon\PointSystem\Model\AvatarDecoration;
use Ramon\PointSystem\Model\ShopClaim;

class DeleteAvatarDecorationController implements RequestHandlerInterface
{
    public function __construct(
        protected FilesystemFactory $filesystem,
        protected FeatureGate $features,
    ) {}

    #[\Override]
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertCan('pointSystem.manage');
        $this->features->assertEnabled(ShopClaim::TYPE_AVATAR);

        $params = (array) $request->getAttribute('routeParameters', []);
        $id = (int) ($params['id'] ?? 0);
        $deco = AvatarDecoration::find($id);
        if (! $deco) {
            return new EmptyResponse(204);
        }

        // Remove the backing file via the flarum-assets disk. delete() is
        // idempotent; the local adapter rejects a traversal path with an
        // exception rather than escaping the assets root — swallow it so a
        // malformed legacy image_path never blocks the row delete.
        $imagePath = (string) $deco->image_path;
        if ($imagePath !== '') {
            try {
                $this->filesystem->disk('flarum-assets')->delete($imagePath);
            } catch (\Throwable) {
            }
        }

        $deco->delete();

        return new EmptyResponse(204);
    }
}
