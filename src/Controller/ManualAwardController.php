<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Controller;

use Flarum\Foundation\DispatchEventsTrait;
use Flarum\Http\RequestUtil;
use Flarum\User\User;
use Illuminate\Contracts\Events\Dispatcher;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\PointSystem\Event\PointsManuallyChanged;
use Ramon\PointSystem\Repository\PointsRepository;

/**
 * POST /api/point-system/award (admin only)
 * Body: { userId: int, amount: int, reason?: string }
 *
 * Used by the admin UI to manually award or revoke (negative) points.
 */
class ManualAwardController implements RequestHandlerInterface
{
    use DispatchEventsTrait;

    public function __construct(
        protected PointsRepository $points,
        protected Dispatcher $events,
    ) {}

    #[\Override]
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertCan('pointSystem.manage');

        $body = (array) $request->getParsedBody();
        $userId = (int) ($body['userId'] ?? 0);
        $amount = (int) ($body['amount'] ?? 0);
        $reason = (string) ($body['reason'] ?? 'admin.adjustment');

        if ($userId <= 0 || $amount === 0) {
            return new JsonResponse(['errors' => [['detail' => 'Invalid payload']]], 422);
        }

        // Clamp to a sane range — the DB `balance` / `lifetime` columns are
        // signed INT (32-bit on MySQL); 1B keeps us well inside that ceiling
        // while still allowing legitimate bulk grants. Also caps `reason`
        // length to avoid abuse of the free-text column.
        $amount = max(-1_000_000_000, min(1_000_000_000, $amount));
        $reason = mb_substr($reason, 0, 200);

        $user = User::find($userId);
        if (! $user) {
            return new JsonResponse(['errors' => [['detail' => 'User not found']]], 404);
        }

        if ($amount > 0) {
            $this->points->award($user, $amount, $reason);
        } else {
            // Negative amount means revoke balance only (lifetime intact).
            try {
                $this->points->deduct($user, abs($amount), $reason);
            } catch (\DomainException $e) {
                return new JsonResponse([
                    'errors' => [['detail' => $e->getMessage()]],
                ], 422);
            }
        }

        // Raise the admin-action event on the UserPoints row so it travels
        // through the same `releaseEvents()` pipeline as auto-credits — the
        // notification listener and any audit log react to it uniformly.
        $points = $this->points->getOrCreate($user);
        $points->raise(new PointsManuallyChanged($user, $actor, $amount, $reason ?: null));
        $this->dispatchEventsFor($points, $actor);

        return new JsonResponse(['data' => [
            'userId' => $user->id,
            'balance' => $points->balance,
            'lifetime' => $points->lifetime,
        ]]);
    }
}
