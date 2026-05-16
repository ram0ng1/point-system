<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Support;

use Flarum\User\User;
use Ramon\PointSystem\Model\Trade;

/**
 * Centralised JSON shape for Trade rows. Lives in one place so the six
 * trade controllers and the frontend agree on the same fields — CLAUDE.md
 * §38.6 (helper logic on the model / a single shared place).
 *
 * NOT a JSON:API document. The trade UI is a single bespoke modal with
 * polling; returning a flat envelope keeps the frontend code small.
 */
final class TradeSerializer
{
    public static function serialize(Trade $trade, ?User $actor = null): array
    {
        $trade->loadMissing(['items', 'initiator', 'recipient']);

        $items = $trade->items->map(fn ($it) => [
            'id'        => (int) $it->id,
            'ownerId'   => (int) $it->owner_id,
            'itemType'  => (string) $it->item_type,
            'itemId'    => (int) $it->item_id,
        ])->values()->toArray();

        return [
            'id'                 => (int) $trade->id,
            'status'             => (string) $trade->status,
            'initiator'          => self::partyShape($trade->initiator),
            'recipient'          => self::partyShape($trade->recipient),
            'initiatorPoints'    => (int) $trade->initiator_points,
            'recipientPoints'    => (int) $trade->recipient_points,
            'initiatorAccepted'  => (bool) $trade->initiator_accepted,
            'recipientAccepted'  => (bool) $trade->recipient_accepted,
            'cancelledById'      => $trade->cancelled_by_id !== null ? (int) $trade->cancelled_by_id : null,
            'items'              => $items,
            'updatedAt'          => optional($trade->updated_at)?->toIso8601String(),
            'completedAt'        => optional($trade->completed_at)?->toIso8601String(),
            'cancelledAt'        => optional($trade->cancelled_at)?->toIso8601String(),
            // `youAre` lets the frontend render its "your side" panel without
            // re-deriving from the actor on every render. null when the
            // caller isn't a participant (defensive — controllers gate that).
            'youAre' => $actor && (int) $actor->id === (int) $trade->initiator_id
                ? 'initiator'
                : ($actor && (int) $actor->id === (int) $trade->recipient_id ? 'recipient' : null),
        ];
    }

    private static function partyShape(?User $user): array
    {
        if (! $user) {
            return ['id' => 0, 'username' => '', 'displayName' => '', 'avatarUrl' => null];
        }
        return [
            'id'          => (int) $user->id,
            'username'    => (string) $user->username,
            'displayName' => (string) ($user->display_name ?? $user->username),
            'avatarUrl'   => $user->avatar_url ?: null,
        ];
    }
}
