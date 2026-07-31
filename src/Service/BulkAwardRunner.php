<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Service;

use Flarum\Foundation\DispatchEventsTrait;
use Flarum\User\User;
use Illuminate\Contracts\Events\Dispatcher;
use Psr\Log\LoggerInterface;
use Ramon\PointSystem\Event\PointsManuallyChanged;
use Ramon\PointSystem\Repository\PointsRepository;

/**
 * Aplica um ajuste de pontos em lote sobre uma coleção de usuários.
 *
 * Extraído do controller para que o caminho inline (forums pequenos) e o job
 * de fila (forums grandes) compartilhem a mesma semântica: mesma ordem de
 * operações, mesmo pipeline de eventos e o mesmo registro de falha.
 */
class BulkAwardRunner
{
    use DispatchEventsTrait;

    public function __construct(
        protected PointsRepository $points,
        protected Dispatcher $events,
        protected LoggerInterface $logger,
    ) {}

    /**
     * @param  iterable<User>  $users
     * @return array{awarded: int, errors: int}
     */
    public function run(iterable $users, int $amount, string $reason, ?User $actor): array
    {
        $awarded = 0;
        $errors  = 0;

        foreach ($users as $user) {
            if ($this->applyTo($user, $amount, $reason, $actor)) {
                $awarded++;
            } else {
                $errors++;
            }
        }

        return ['awarded' => $awarded, 'errors' => $errors];
    }

    /**
     * Credita ou debita um usuário; devolve `false` quando o saldo não mudou.
     *
     * O evento vai num try separado porque a entrega da notificação não
     * invalida o crédito já persistido — falha ali é registrada no log sem
     * contar como erro de aplicação, senão o relatório devolvido ao admin
     * marcaria como falho um usuário que efetivamente recebeu os pontos.
     */
    protected function applyTo(User $user, int $amount, string $reason, ?User $actor): bool
    {
        try {
            if ($amount > 0) {
                $this->points->award($user, $amount, $reason);
            } else {
                $this->points->deduct($user, abs($amount), $reason);
            }
        } catch (\Throwable $e) {
            $this->logger->warning('point-system: bulk award failed for user', [
                'user_id' => (int) $user->id,
                'amount'  => $amount,
                'class'   => $e::class,
                'error'   => $e->getMessage(),
            ]);

            return false;
        }

        try {
            $points = $this->points->getOrCreate($user);
            $points->raise(new PointsManuallyChanged($user, $actor, $amount, $reason ?: null));
            $this->dispatchEventsFor($points, $actor);
        } catch (\Throwable $e) {
            $this->logger->warning('point-system: bulk award notification failed', [
                'user_id' => (int) $user->id,
                'class'   => $e::class,
                'error'   => $e->getMessage(),
            ]);
        }

        return true;
    }
}
