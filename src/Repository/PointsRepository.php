<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Repository;

use Flarum\Foundation\DispatchEventsTrait;
use Flarum\Settings\SettingsRepositoryInterface;
use Flarum\User\User;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Database\ConnectionResolverInterface;
use Ramon\PointSystem\Event\PointsAwarded;
use Ramon\PointSystem\Model\GroupOffer;
use Ramon\PointSystem\Model\PointTransaction;
use Ramon\PointSystem\Model\UserPoints;

/**
 * Central service for all point operations.
 *
 * - award(): atomically credits points (lifetime + balance) and writes a tx row
 * - deduct(): atomically removes balance points (does NOT reduce lifetime)
 * - revert(): reverses a prior credit (used when a like is undone, etc.)
 * - syncAutoGroups(): keeps user's groups in line with their lifetime points
 *
 * Events live on the UserPoints model (via EventGeneratorTrait). They are
 * raised inside the same transaction as the state change and flushed once
 * the row is saved, so a rolled-back transaction never leaks a stale event.
 */
class PointsRepository
{
    use DispatchEventsTrait;

    public function __construct(
        protected SettingsRepositoryInterface $settings,
        protected Dispatcher $events,
        protected ConnectionResolverInterface $db,
    ) {}

    public function getOrCreate(User $user): UserPoints
    {
        return UserPoints::firstOrCreate(
            ['user_id' => $user->id],
            ['balance' => 0, 'lifetime' => 0],
        );
    }

    /**
     * Credit a user with points. Updates both lifetime and balance, logs a
     * transaction row, then syncs auto-groups.
     *
     * Returns the transaction row (null if amount was zero / system disabled).
     */
    public function award(
        User $user,
        int $amount,
        string $reason,
        ?string $referenceType = null,
        ?int $referenceId = null,
        ?array $meta = null,
    ): ?PointTransaction {
        if ($amount <= 0 || ! $this->isEnabled()) {
            return null;
        }

        $tx = null;
        $points = $this->db->connection()->transaction(function () use ($user, $amount, $reason, $referenceType, $referenceId, $meta, &$tx) {
            $points = $this->getOrCreate($user);
            $points->lifetime += $amount;
            $points->balance  += $amount;
            $points->raise(new PointsAwarded($user, $amount, $reason));
            $points->save();

            $tx = PointTransaction::create([
                'user_id' => $user->id,
                'amount' => $amount,
                'reason' => $reason,
                'reference_type' => $referenceType,
                'reference_id' => $referenceId,
                'meta' => $meta,
            ]);

            $this->syncAutoGroups($user, $points);

            return $points;
        });

        $this->dispatchEventsFor($points);

        return $tx;
    }

    /**
     * Reverse a prior credit. Lifetime CAN drop here because the original action
     * was undone (e.g. user un-liked a post). Skips if no matching credit exists.
     */
    public function revert(
        User $user,
        string $reason,
        string $referenceType,
        int $referenceId,
    ): void {
        if (! $this->isEnabled()) {
            return;
        }

        $points = $this->db->connection()->transaction(function () use ($user, $reason, $referenceType, $referenceId) {
            $tx = PointTransaction::where('user_id', $user->id)
                ->where('reason', $reason)
                ->where('reference_type', $referenceType)
                ->where('reference_id', $referenceId)
                ->where('amount', '>', 0)
                ->orderByDesc('id')
                ->first();

            if (! $tx) {
                return null;
            }

            $points = $this->getOrCreate($user);
            $points->lifetime = max(0, $points->lifetime - $tx->amount);
            $points->balance  = max(0, $points->balance - $tx->amount);
            $points->raise(new PointsAwarded($user, -$tx->amount, $reason.'.revert'));
            $points->save();

            PointTransaction::create([
                'user_id' => $user->id,
                'amount' => -$tx->amount,
                'reason' => $reason.'.revert',
                'reference_type' => $referenceType,
                'reference_id' => $referenceId,
            ]);

            $this->syncAutoGroups($user, $points);

            return $points;
        });

        if ($points) {
            $this->dispatchEventsFor($points);
        }
    }

    /**
     * Spend balance points. Throws \DomainException when balance is insufficient.
     * Lifetime is NOT touched.
     */
    public function deduct(
        User $user,
        int $amount,
        string $reason,
        ?string $referenceType = null,
        ?int $referenceId = null,
    ): PointTransaction {
        if ($amount <= 0) {
            throw new \InvalidArgumentException('Amount must be positive');
        }

        $tx = null;
        $points = $this->db->connection()->transaction(function () use ($user, $amount, $reason, $referenceType, $referenceId, &$tx) {
            $points = $this->getOrCreate($user);
            if ($points->balance < $amount) {
                throw new \DomainException('Insufficient point balance');
            }
            $points->balance -= $amount;
            $points->raise(new PointsAwarded($user, -$amount, $reason));
            $points->save();

            $tx = PointTransaction::create([
                'user_id' => $user->id,
                'amount' => -$amount,
                'reason' => $reason,
                'reference_type' => $referenceType,
                'reference_id' => $referenceId,
            ]);

            return $points;
        });

        $this->dispatchEventsFor($points);

        return $tx;
    }

    /**
     * Walk the auto-enabled group offers (ordered by points_required asc) and
     * attach the user to every offer they qualify for. Only offers with
     * is_auto=true participate: purchase-only offers are never auto-attached
     * and never auto-detached. Lifetime drops below the threshold of an
     * is_auto offer will detach the user from that group.
     */
    public function syncAutoGroups(User $user, ?UserPoints $points = null): void
    {
        if (! (bool) $this->settings->get('point-system.auto_group_enabled', true)) {
            return;
        }

        $points ??= $this->getOrCreate($user);
        $lifetime = $points->lifetime;

        $offers = GroupOffer::where('is_enabled', true)
            ->where('is_auto', true)
            ->orderBy('points_required')
            ->get();

        $managedGroupIds = $offers->pluck('group_id')->all();
        if (empty($managedGroupIds)) {
            return;
        }

        $qualifyingIds = $offers
            ->filter(fn ($o) => $lifetime >= $o->points_required)
            ->pluck('group_id')
            ->all();

        $currentIds = $user->groups()->pluck('groups.id')->all();

        $toAdd    = array_diff($qualifyingIds, $currentIds);
        $toRemove = array_intersect(array_diff($managedGroupIds, $qualifyingIds), $currentIds);

        if ($toAdd) {
            $user->groups()->attach($toAdd);
        }
        if ($toRemove) {
            $user->groups()->detach($toRemove);
        }
    }

    public function isEnabled(): bool
    {
        return (bool) $this->settings->get('point-system.enabled', true);
    }

    public function settingInt(string $key, int $default = 0): int
    {
        return (int) $this->settings->get($key, $default);
    }
}
