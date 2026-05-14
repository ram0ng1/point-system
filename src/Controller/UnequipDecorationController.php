<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Controller;

use Flarum\Http\RequestUtil;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\PointSystem\FeatureGate;
use Ramon\PointSystem\Model\ShopClaim;
use Ramon\PointSystem\Repository\PointsRepository;

class UnequipDecorationController implements RequestHandlerInterface
{
    public function __construct(
        protected PointsRepository $points,
        protected FeatureGate $features,
    ) {}

    #[\Override]
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertRegistered();

        $body = (array) $request->getParsedBody();
        $type = $body['type'] ?? null;

        if (! in_array($type, [
            ShopClaim::TYPE_AVATAR,
            ShopClaim::TYPE_NAME,
            ShopClaim::TYPE_COVER,
            ShopClaim::TYPE_TITLE,
            ShopClaim::TYPE_POST_HL,
        ], true)) {
            return new JsonResponse(['errors' => [['detail' => 'Invalid type']]], 422);
        }

        $this->features->assertEnabled($type);

        $points = $this->points->getOrCreate($actor);
        if ($type === ShopClaim::TYPE_AVATAR) {
            $points->current_avatar_decoration_id = null;
        } elseif ($type === ShopClaim::TYPE_COVER) {
            $points->current_cover_decoration_id = null;
        } elseif ($type === ShopClaim::TYPE_TITLE) {
            $points->current_title_decoration_id = null;
        } elseif ($type === ShopClaim::TYPE_POST_HL) {
            $points->current_post_hl_decoration_id = null;
        } else {
            $points->current_name_decoration_id = null;
        }
        $points->save();

        return new JsonResponse(['data' => ['unequipped' => true, 'type' => $type]]);
    }
}
