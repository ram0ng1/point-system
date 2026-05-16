<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Event;

use Ramon\PointSystem\Model\Trade;

/**
 * Dispatched by {@see \Ramon\PointSystem\Repository\TradeRepository::execute}
 * once a trade commits. The listener notifies both participants so they see
 * the completed exchange in their notification bell.
 */
class TradeCompleted
{
    public function __construct(public Trade $trade) {}
}
