<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Controller;

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
 * POST /api/point-system/bulk-award (admin only)
 * Body: { amount: int, reason?: string, userIds?: int[] }
 *
 * If `userIds` is omitted or empty — awards all registered users.
 * If `userIds` is provided — awards only the listed users.
 *
 * Processes in chunks of 100 to avoid memory issues on large forums.
 */
class BulkAwardController implements RequestHandlerInterface
{
    public function __construct(
        protected PointsRepository $points,
        protected Dispatcher $events,
    ) {}

    #[\Override]
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertCan('pointSystem.manage');

        $body   = (array) $request->getParsedBody();
        $amount = (int) ($body['amount'] ?? 0);
        $reason = mb_substr((string) ($body['reason'] ?? 'admin.bulk'), 0, 200);
        $userIds = $body['userIds'] ?? null;

        if ($amount === 0) {
            return new JsonResponse(['errors' => [['detail' => 'Amount cannot be zero']]], 422);
        }

        $amount = max(-1_000_000_000, min(1_000_000_000, $amount));

        $awarded = 0;
        $errors  = 0;

        $process = function (User $user) use ($amount, $reason, $actor, &$awarded, &$errors): void {
            try {
                if ($amount > 0) {
                    $this->points->award($user, $amount, $reason);
                } else {
                    $this->points->deduct($user, abs($amount), $reason);
                }
                $points = $this->points->getOrCreate($user);
                $points->raise(new PointsManuallyChanged($user, $actor, $amount, $reason ?: null));
                $this->events->dispatch($points->releaseEvents() ?? []);
                $awarded++;
            } catch (\Throwable) {
                $errors++;
            }
        };

        if (!empty($userIds) && is_array($userIds)) {
            $ids = array_map('intval', $userIds);
            User::whereIn('id', $ids)->chunk(100, function ($users) use ($process) {
                foreach ($users as $user) {
                    $process($user);
                }
            });
        } else {
            User::chunk(100, function ($users) use ($process) {
                foreach ($users as $user) {
                    $process($user);
                }
            });
        }

        return new JsonResponse(['data' => ['awarded' => $awarded, 'errors' => $errors]]);
    }
}
