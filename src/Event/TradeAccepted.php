<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Event;

use Flarum\User\User;
use Ramon\PointSystem\Model\Trade;

/**
 * Dispatched by {@see \Ramon\PointSystem\Controller\AcceptTradeController}
 * when ONE side of a trade flips its accept flag to `true` (the OPPOSITE
 * direction — un-accepting — does NOT dispatch this).
 *
 * The listener notifies the OTHER participant ("Bob accepted your trade,
 * accept yours to finalise") so they know the trade is waiting on their
 * action. Lets users who closed the trade modal mid-negotiation come
 * back without having to babysit it.
 *
 * Does NOT fire when BOTH sides are now accepted — at that point the
 * countdown banner takes over and a separate `TradeCompleted` event
 * fires on finalize. Sending a "Bob accepted" alert in the same instant
 * as "trade completed" would be confusing noise.
 */
class TradeAccepted
{
    public function __construct(
        public Trade $trade,
        public User $acceptedBy,
    ) {}
}
