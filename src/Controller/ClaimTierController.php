<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Controller;

use Flarum\Foundation\DispatchEventsTrait;
use Flarum\Group\Group;
use Flarum\Http\RequestUtil;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Database\ConnectionInterface;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\PointSystem\Event\TierClaimed;
use Ramon\PointSystem\Model\AutoGroupTier;
use Ramon\PointSystem\Repository\PointsRepository;

/**
 * POST /api/point-system/tier-claim
 * Body: { id: tier_id }
 *
 * Lets a user manually claim a specific group tier they've already earned by
 * accumulating enough lifetime points. The auto-sync that runs on every
 * `award()` should normally cover this, but a manual endpoint is handy for:
 *   - Users who already had points before the admin turned the feature on.
 *   - Users on legacy data where the auto-attach was skipped.
 *   - UX clarity (the user clicks "Claim" and sees the group attached).
 */
class ClaimTierController implements RequestHandlerInterface
{
    use DispatchEventsTrait;

    public function __construct(
        protected PointsRepository $points,
        protected SettingsRepositoryInterface $settings,
        protected Dispatcher $events,
        protected ConnectionInterface $db,
    ) {}

    #[\Override]
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertRegistered();

        if (! (bool) $this->settings->get('point-system.auto_group_enabled', true)) {
            return new JsonResponse([
                'errors' => [['code' => 'feature_disabled', 'detail' => 'Group tiers are disabled.']],
            ], 422);
        }

        $body = (array) $request->getParsedBody();
        $id   = (int) ($body['id'] ?? 0);
        if ($id <= 0) {
            return new JsonResponse(['errors' => [['detail' => 'Invalid tier']]], 422);
        }

        /** @var AutoGroupTier|null $tier */
        $tier = AutoGroupTier::where('id', $id)->where('is_enabled', true)->first();
        if (! $tier) {
            return new JsonResponse(['errors' => [['detail' => 'Tier not found']]], 404);
        }

        // Idempotent — already in the group means we just return success.
        $alreadyMember = $actor->groups()->where('groups.id', $tier->group_id)->exists();
        if ($alreadyMember) {
            $userPoints = $this->points->getOrCreate($actor);
            return new JsonResponse(['data' => [
                'tierId' => $tier->id,
                'groupId' => $tier->group_id,
                'balance' => (int) $userPoints->balance,
                'lifetime' => (int) $userPoints->lifetime,
                'alreadyOwned' => true,
            ]], 200);
        }

        $cost = max(0, (int) $tier->points_required);

        // Atomic: deduct + attach must both succeed or both roll back. The old
        // code did the attach AFTER the deduct's own transaction committed, so
        // a failed attach left the user paying for a tier they didn't get.
        try {
            $this->db->transaction(function () use ($actor, $tier, $cost) {
                if ($cost > 0) {
                    $this->points->deduct($actor, $cost, 'tier.claim', 'auto_group_tier', $tier->id);
                }
                // syncWithoutDetaching keeps any other groups the user is in.
                $actor->groups()->syncWithoutDetaching([$tier->group_id]);

                $group = Group::find($tier->group_id);
                if ($group) {
                    $actor->raise(new TierClaimed($actor, $group, $cost));
                }
            });
        } catch (\DomainException $e) {
            return new JsonResponse([
                'errors' => [['code' => 'insufficient_balance', 'detail' => $e->getMessage()]],
            ], 422);
        }

        $this->dispatchEventsFor($actor);

        $userPoints = $this->points->getOrCreate($actor);
        return new JsonResponse(['data' => [
            'tierId' => $tier->id,
            'groupId' => $tier->group_id,
            'balance' => (int) $userPoints->balance,
            'lifetime' => (int) $userPoints->lifetime,
        ]], 200);
    }
}
