<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Listener;

use Flarum\User\Event\Registered;
use Ramon\PointSystem\FeatureGate;
use Ramon\PointSystem\Repository\PointsRepository;

class InitUserPoints
{
    public function __construct(
        protected PointsRepository $points,
        protected FeatureGate $features,
    ) {}

    /**
     * Cria a linha de saldo SEMPRE — mesmo com as regras automáticas
     * desligadas o usuário precisa do registro para receber concessões
     * manuais, comprar na loja e trocar. Só o bônus de cadastro é gated.
     */
    public function handle(Registered $event): void
    {
        $amount = $this->points->settingInt('point-system.points_per_registration', 50);
        $this->points->getOrCreate($event->user);

        if ($amount > 0 && $this->features->areAutoAwardsEnabled()) {
            $this->points->award(
                $event->user,
                $amount,
                'user.registered',
                'user',
                $event->user->id,
            );
        }
    }
}
