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

/**
 * POST /api/point-system/equip
 * Body: { type: "avatar_decoration" | "name_decoration", id: int }
 */
class EquipDecorationController implements RequestHandlerInterface
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
        $id   = (int) ($body['id'] ?? 0);

        if (! in_array($type, [
            ShopClaim::TYPE_AVATAR,
            ShopClaim::TYPE_NAME,
            ShopClaim::TYPE_COVER,
            ShopClaim::TYPE_TITLE,
            ShopClaim::TYPE_POST_HL,
        ], true) || $id <= 0) {
            return new JsonResponse(['errors' => [['detail' => 'Invalid item']]], 422);
        }

        $this->features->assertEnabled($type);

        // Must own the item
        $owns = ShopClaim::where('user_id', $actor->id)
            ->where('item_type', $type)
            ->where('item_id', $id)
            ->exists();
        if (! $owns) {
            return new JsonResponse(['errors' => [['detail' => 'You do not own this decoration']]], 403);
        }

        $points = $this->points->getOrCreate($actor);
        if ($type === ShopClaim::TYPE_AVATAR) {
            $points->current_avatar_decoration_id = $id;
        } elseif ($type === ShopClaim::TYPE_COVER) {
            $points->current_cover_decoration_id = $id;
        } elseif ($type === ShopClaim::TYPE_TITLE) {
            $points->current_title_decoration_id = $id;
        } elseif ($type === ShopClaim::TYPE_POST_HL) {
            $points->current_post_hl_decoration_id = $id;
        } else {
            $points->current_name_decoration_id = $id;
        }
        $points->save();

        return new JsonResponse(['data' => ['equipped' => $id, 'type' => $type]]);
    }
}
