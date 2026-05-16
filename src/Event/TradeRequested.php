<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Event;

use Ramon\PointSystem\Model\Trade;

/**
 * Dispatched by {@see \Ramon\PointSystem\Controller\OpenTradeController}
 * after a NEW trade row is created. The listener notifies the recipient
 * so they know a trade window is waiting for them.
 *
 * Re-opening an already-pending trade between the same two users does NOT
 * dispatch this — the recipient was already notified the first time.
 */
class TradeRequested
{
    public function __construct(public Trade $trade) {}
}
