<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Listener;

use Flarum\Notification\NotificationSyncer;
use Flarum\Settings\SettingsRepositoryInterface;
use Psr\Log\LoggerInterface;
use Ramon\PointSystem\Event\PointsAwarded;
use Ramon\PointSystem\Notification\PointsEarnedBlueprint;
use Throwable;

/**
 * Notifica o usuário quando ele ganha pontos por uma AÇÃO.
 *
 * Escuta {@see PointsAwarded}, que o repositório levanta em TODA mutação de
 * saldo — inclusive `deduct()` e `revert()`, com valor negativo. Por isso os
 * três filtros abaixo, nesta ordem:
 *
 *   1. valor positivo — gasto e estorno não são "ganho";
 *   2. motivo automático conhecido — o ajuste manual do admin já tem
 *      {@see \Ramon\PointSystem\Notification\PointsManualBlueprint}, e
 *      notificar duas vezes o mesmo evento é pior que não notificar;
 *   3. as configurações de volume (ver abaixo).
 *
 * VOLUME. Cada concessão vira uma notificação própria: `matchingBlueprint`
 * compara a coluna `data`, então valores/motivos diferentes nunca colapsam
 * na mesma linha. Num fórum ativo "pontos por resposta" significa um alerta
 * por post — o anti-padrão que o próprio flarum/mentions carrega (§34/Q).
 * Daí duas chaves:
 *
 *   - `notify_on_award`  liga/desliga o recurso inteiro;
 *   - `notify_bonus_only` (padrão LIGADO) restringe aos bônus de login
 *     diário e cadastro, que são de baixa frequência e não acompanham uma
 *     ação que o usuário acabou de fazer conscientemente.
 *
 * O usuário ainda tem a opção por tipo em /settings, que o Flarum monta
 * sozinho para todo blueprint registrado.
 *
 * REALTIME. Nada a fazer aqui: `NotificationSyncer::sync()` percorre TODOS
 * os drivers registrados, e o flarum/realtime registra o driver `realtime`
 * (Push\NotificationDriver), que empurra a notificação pelo websocket para
 * cada destinatário. Alerta e push saem do mesmo `sync()`.
 */
class SendNotificationWhenPointsEarned
{
    public function __construct(
        protected NotificationSyncer $notifications,
        protected SettingsRepositoryInterface $settings,
        protected LoggerInterface $logger,
    ) {}

    public function handle(PointsAwarded $event): void
    {
        if ($event->amount <= 0) {
            return;
        }

        if (! in_array($event->reason, PointsEarnedBlueprint::REASONS, true)) {
            return;
        }

        if (! (bool) $this->settings->get('point-system.notify_on_award', false)) {
            return;
        }

        if ((bool) $this->settings->get('point-system.notify_bonus_only', true)
            && ! in_array($event->reason, PointsEarnedBlueprint::BONUS_REASONS, true)
        ) {
            return;
        }

        try {
            $this->notifications->sync(
                new PointsEarnedBlueprint($event->user, $event->amount, $event->reason),
                [$event->user],
            );
        } catch (Throwable $e) {
            /*
             * Falha de notificação NUNCA pode derrubar a ação que a gerou: o
             * usuário já postou e os pontos já estão no saldo — commitados
             * antes deste evento ser despachado. Registrar e seguir.
             */
            $this->logger->warning('point-system: failed to send points-earned notification', [
                'user_id' => (int) $event->user->id,
                'reason'  => $event->reason,
                'error'   => $e->getMessage(),
            ]);
        }
    }
}
