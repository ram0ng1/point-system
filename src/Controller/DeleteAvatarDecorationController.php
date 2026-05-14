<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Controller;

use Flarum\Foundation\Paths;
use Flarum\Http\RequestUtil;
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
        protected Paths $paths,
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

        $diskPath = $this->paths->public.'/assets/'.$deco->image_path;
        if (is_file($diskPath)) {
            @unlink($diskPath);
        }

        $deco->delete();

        return new EmptyResponse(204);
    }
}
