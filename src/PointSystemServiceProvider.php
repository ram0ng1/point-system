<?php

/*
 * This file is part of ramon/point-system.
 *
 * Copyright (c) 2026 Ramon Guilherme.
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

declare(strict_types=1);

namespace Ramon\PointSystem;

use Flarum\Foundation\AbstractServiceProvider;
use Ramon\PointSystem\Repository\PointsRepository;

class PointSystemServiceProvider extends AbstractServiceProvider
{
    public function register(): void
    {
        $this->container->singleton(PointsRepository::class);
    }
}
