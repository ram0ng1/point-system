<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Job;

use Flarum\Queue\AbstractJob;
use Flarum\User\User;
use Ramon\PointSystem\Service\BulkAwardRunner;

/**
 * Processa uma fatia do bulk award fora do ciclo da request.
 *
 * Recebe ids (não models) porque o admin pode ter sido removido entre o
 * disparo e o worker: `SerializesModels` faria o job explodir na
 * desserialização, enquanto o id deixa o ator virar `null` e o crédito
 * seguir normalmente.
 */
class BulkAwardJob extends AbstractJob
{
    /**
     * @param  list<int>  $userIds
     */
    public function __construct(
        protected array $userIds,
        protected int $amount,
        protected string $reason,
        protected ?int $actorId,
    ) {
        parent::__construct();
    }

    public function handle(BulkAwardRunner $runner): void
    {
        if ($this->userIds === []) {
            return;
        }

        $actor = $this->actorId !== null ? User::find($this->actorId) : null;

        $runner->run(
            User::whereIn('id', $this->userIds)->cursor(),
            $this->amount,
            $this->reason,
            $actor,
        );
    }
}
