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
use Ramon\PointSystem\Model\GroupOffer;
use Ramon\PointSystem\Repository\PointsRepository;
use Ramon\PointSystem\Support\ItemAvailability;

/**
 * POST /api/point-system/tier-claim
 * Body: { id: offer_id, mode?: 'auto' | 'purchase' }
 *
 * Resolves both unlock paths exposed by a {@see GroupOffer}:
 *
 *  - mode=auto (or omitted when only is_auto is set): free claim, requires the
 *    user's lifetime points to be >= offer.points_required. Mirrors the
 *    syncAutoGroups() background job for users whose auto-attach was skipped.
 *  - mode=purchase (or omitted when only is_purchasable is set): paid claim,
 *    spends offer.price from the user's balance regardless of lifetime totals.
 *
 * The two unlocks share an endpoint so the UI can present "Join (you already
 * qualify)" and "Buy access" side by side on the same card without juggling
 * two routes.
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
                'errors' => [['code' => 'feature_disabled', 'detail' => 'Group offers are disabled.']],
            ], 422);
        }

        $body = (array) $request->getParsedBody();
        $id   = (int) ($body['id'] ?? 0);
        $mode = (string) ($body['mode'] ?? '');
        if ($id <= 0) {
            return new JsonResponse(['errors' => [['detail' => 'Invalid offer']]], 422);
        }

        /** @var GroupOffer|null $offer */
        $offer = GroupOffer::where('id', $id)->where('is_enabled', true)->first();
        if (! $offer) {
            return new JsonResponse(['errors' => [['detail' => 'Offer not found']]], 404);
        }

        if (! $offer->is_auto && ! $offer->is_purchasable) {
            return new JsonResponse([
                'errors' => [['code' => 'offer_locked', 'detail' => 'This group offer is not currently obtainable.']],
            ], 422);
        }

        // Availability gate — date window, max claims, group restriction.
        // Mirrors ClaimItemController so the same set of refusal codes is
        // surfaced uniformly to the frontend.
        $reason = ItemAvailability::reasonNotClaimable($offer, $actor);
        if ($reason !== null) {
            return new JsonResponse([
                'errors' => [['code' => $reason, 'detail' => $reason]],
            ], 422);
        }

        $alreadyMember = $actor->groups()->where('groups.id', $offer->group_id)->exists();
        if ($alreadyMember) {
            $userPoints = $this->points->getOrCreate($actor);
            return new JsonResponse(['data' => [
                'offerId'      => $offer->id,
                'groupId'      => $offer->group_id,
                'balance'      => (int) $userPoints->balance,
                'lifetime'     => (int) $userPoints->lifetime,
                'alreadyOwned' => true,
            ]], 200);
        }

        $resolvedMode = $this->resolveMode($offer, $mode);
        if ($resolvedMode === null) {
            return new JsonResponse([
                'errors' => [['code' => 'invalid_mode', 'detail' => 'Requested unlock mode is not available for this offer.']],
            ], 422);
        }

        $userPoints = $this->points->getOrCreate($actor);

        if ($resolvedMode === 'auto') {
            if ((int) $userPoints->lifetime < (int) $offer->points_required) {
                return new JsonResponse([
                    'errors' => [['code' => 'threshold_not_met', 'detail' => 'You have not reached the lifetime threshold for this group yet.']],
                ], 422);
            }
            $cost = 0;
        } else {
            $cost = max(0, (int) $offer->price);
        }

        try {
            $this->db->transaction(function () use ($actor, $offer, $cost, $resolvedMode) {
                // Lock the offer row so a parallel claim cannot race past
                // max_claims. We re-read the row inside the lock and re-check
                // availability — the un-locked read above is a fast-fail path
                // but is NOT authoritative.
                /** @var GroupOffer $offer */
                $offer = GroupOffer::where('id', $offer->id)->lockForUpdate()->firstOrFail();

                $reason = ItemAvailability::reasonNotClaimable($offer, $actor);
                if ($reason !== null) {
                    throw new \DomainException($reason);
                }

                if ($cost > 0) {
                    $this->points->deduct(
                        $actor,
                        $cost,
                        $resolvedMode === 'purchase' ? 'group.purchase' : 'tier.claim',
                        'group_offer',
                        $offer->id,
                    );
                }
                $actor->groups()->syncWithoutDetaching([$offer->group_id]);

                // Track grant count for the per-offer limit. Auto-attach via
                // syncAutoGroups bypasses this controller so it does NOT
                // increment — max_claims here counts explicit claims only.
                $offer->claim_count = (int) $offer->claim_count + 1;
                $offer->save();

                $group = Group::find($offer->group_id);
                if ($group) {
                    $actor->raise(new TierClaimed($actor, $group, $cost));
                }
            });
        } catch (\DomainException $e) {
            $code = $e->getMessage();
            $known = ['expired', 'sold_out', 'group_restricted', 'not_yet_available', 'disabled'];
            return new JsonResponse([
                'errors' => [[
                    'code'   => in_array($code, $known, true) ? $code : 'insufficient_balance',
                    'detail' => $code,
                ]],
            ], 422);
        }

        $this->dispatchEventsFor($actor);

        $userPoints = $this->points->getOrCreate($actor);
        return new JsonResponse(['data' => [
            'offerId'  => $offer->id,
            'groupId'  => $offer->group_id,
            'mode'     => $resolvedMode,
            'balance'  => (int) $userPoints->balance,
            'lifetime' => (int) $userPoints->lifetime,
        ]], 200);
    }

    /**
     * @return 'auto'|'purchase'|null
     */
    protected function resolveMode(GroupOffer $offer, string $requested): ?string
    {
        if ($requested === 'auto') {
            return $offer->is_auto ? 'auto' : null;
        }
        if ($requested === 'purchase') {
            return $offer->is_purchasable ? 'purchase' : null;
        }
        if ($offer->is_purchasable && ! $offer->is_auto) {
            return 'purchase';
        }
        if ($offer->is_auto && ! $offer->is_purchasable) {
            return 'auto';
        }
        return 'purchase';
    }
}
