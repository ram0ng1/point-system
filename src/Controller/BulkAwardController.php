<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Controller;

use Flarum\Http\RequestUtil;
use Flarum\User\User;
use Illuminate\Contracts\Queue\Queue;
use Illuminate\Queue\SyncQueue;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\PointSystem\Job\BulkAwardJob;
use Ramon\PointSystem\Service\BulkAwardRunner;

/**
 * POST /api/point-system/bulk-award (admin only)
 * Body: { amount: int, reason?: string, userIds?: int[] }
 *
 * Sem `userIds`, o alvo é toda a base de usuários registrados.
 *
 * O trabalho é limitado por request: até {@see self::INLINE_LIMIT} usuários
 * roda inline e devolve a contagem exata; acima disso vira uma sequência de
 * {@see BulkAwardJob} na fila e a resposta é 202. Cada usuário custa uma
 * transação, o sync de auto-grupos e uma notificação — percorrer dezenas de
 * milhares deles dentro do handler estoura `request_terminate_timeout` e
 * deixa o award aplicado pela metade, sem retorno para o admin.
 */
class BulkAwardController implements RequestHandlerInterface
{
    /**
     * Teto de usuários processados dentro da própria request.
     */
    protected const INLINE_LIMIT = 200;

    /**
     * Quantidade de usuários por job enfileirado.
     */
    protected const CHUNK = 200;

    public function __construct(
        protected BulkAwardRunner $runner,
        protected Queue $queue,
    ) {}

    #[\Override]
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertCan('pointSystem.manage');

        $body    = (array) $request->getParsedBody();
        $amount  = (int) ($body['amount'] ?? 0);
        $reason  = mb_substr((string) ($body['reason'] ?? 'admin.bulk'), 0, 200);
        $userIds = $body['userIds'] ?? null;

        if ($amount === 0) {
            return new JsonResponse(['errors' => [['detail' => 'Amount cannot be zero']]], 422);
        }

        $amount = max(-1_000_000_000, min(1_000_000_000, $amount));

        $query = User::query();

        if (! empty($userIds) && is_array($userIds)) {
            $ids = array_values(array_unique(array_filter(
                array_map('intval', $userIds),
                fn (int $id) => $id > 0,
            )));

            if ($ids === []) {
                return new JsonResponse(['errors' => [['detail' => 'No valid user ids supplied']]], 422);
            }

            $query->whereIn('id', $ids);
        }

        $total = (clone $query)->count();

        if ($total === 0) {
            return new JsonResponse(['data' => [
                'awarded' => 0,
                'errors'  => 0,
                'queued'  => false,
                'total'   => 0,
            ]]);
        }

        if ($total <= self::INLINE_LIMIT) {
            $result = $this->runner->run($query->cursor(), $amount, $reason, $actor);

            return new JsonResponse(['data' => $result + ['queued' => false, 'total' => $total]]);
        }

        /**
         * Sob o driver `sync` o push executa inline, então enfileirar não
         * protegeria o worker: recusamos e apontamos a configuração que
         * destrava o lote grande.
         */
        if ($this->queue instanceof SyncQueue) {
            return new JsonResponse(['errors' => [[
                'code'   => 'queue_required',
                'detail' => 'This bulk award targets '.$total.' users. Configure a queue driver'
                    .' (e.g. redis or database) and run `php flarum queue:work`, or send the'
                    .' award in batches of at most '.self::INLINE_LIMIT.' users.',
            ]]], 422);
        }

        $chunks = 0;
        $actorId = (int) $actor->id;

        $query->select('id')->chunkById(self::CHUNK, function ($users) use (&$chunks, $amount, $reason, $actorId) {
            $this->queue->push(new BulkAwardJob(
                array_map('intval', $users->pluck('id')->all()),
                $amount,
                $reason,
                $actorId,
            ));
            $chunks++;
        });

        return new JsonResponse(['data' => [
            'queued' => true,
            'total'  => $total,
            'chunks' => $chunks,
        ]], 202);
    }
}
