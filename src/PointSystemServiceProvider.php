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
use Ramon\PointSystem\Model\GroupOffer;
use Ramon\PointSystem\Repository\PointsRepository;

class PointSystemServiceProvider extends AbstractServiceProvider
{
    #[\Override]
    public function register(): void
    {
        $this->container->singleton(PointsRepository::class);
    }

    public function boot(): void
    {
        // PointsRepository é singleton e memoiza a lista de auto-offers em
        // memória. Em workers de longa vida (Octane / queue) o singleton
        // sobrevive entre requests, então uma edição de GroupOffer pelo admin
        // deixaria o cache obsoleto até o worker reciclar. Ligar a invalidação
        // aos eventos do model garante que QUALQUER create/update/delete de
        // GroupOffer — endpoint admin ou outro caminho — limpe o cache na hora.
        $invalidate = fn () => $this->container->make(PointsRepository::class)->clearAutoOffersCache();
        GroupOffer::saved($invalidate);
        GroupOffer::deleted($invalidate);
    }
}
