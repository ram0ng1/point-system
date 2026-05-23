<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Listener;

use Carbon\Carbon;
use Flarum\User\Event\LoggedIn;
use Illuminate\Database\ConnectionResolverInterface;
use Ramon\PointSystem\Model\UserPoints;
use Ramon\PointSystem\Repository\PointsRepository;

/**
 * Credits the configured daily-login bonus the first time a user logs in
 * each calendar day.
 *
 * O check usa `last_daily_bonus_at` em UserPoints sob `lockForUpdate` para
 * que dois logins concorrentes (multi-tab, mobile + desktop) NUNCA paguem
 * dois bônus no mesmo dia. A leitura locked + a gravação do timestamp e o
 * `award()` (que faz seu próprio transaction interno) rodam DENTRO da
 * MESMA transação externa — falha em qualquer passo reverte tudo, e o
 * estado intermediário "stamp gravado, award não rodou" deixa de existir.
 *
 * Antes era um stamp em transação separada do award (relato de auditoria,
 * 2026-05-24): se `award()` lançasse, o stamp já estava commitado, e o
 * usuário perderia o bônus daquele dia silenciosamente.
 *
 * Limitação: hookea `LoggedIn` (login explícito), não session resume. Quem
 * usa "remember me" não acumula bônus até re-autenticar — escrever na DB
 * a cada request seria pior.
 */
class AwardDailyLoginBonus
{
    public function __construct(
        protected PointsRepository $points,
        protected ConnectionResolverInterface $db,
    ) {}

    public function handle(LoggedIn $event): void
    {
        $amount = $this->points->settingInt('point-system.daily_login_bonus', 0);
        if ($amount <= 0) {
            return;
        }

        $user = $event->user;
        $today = Carbon::now()->startOfDay();

        $this->db->connection()->transaction(function () use ($user, $amount, $today) {
            /*
             * Lê e tranca a linha — race entre tabs cai no segundo lock e
             * aí vê o `last_daily_bonus_at` já bumped pelo primeiro.
             * Garantimos a existência da linha com firstOrCreate antes do
             * lock para evitar `null` em fórum upgradado sem migrate.
             */
            $this->points->getOrCreate($user);
            $row = UserPoints::query()
                ->where('user_id', $user->id)
                ->lockForUpdate()
                ->first();
            if (! $row) {
                return;
            }

            if ($row->last_daily_bonus_at !== null
                && $row->last_daily_bonus_at->greaterThanOrEqualTo($today)
            ) {
                return;
            }

            $row->last_daily_bonus_at = Carbon::now();
            $row->save();

            // `award()` abre uma sub-transação (savepoint em MySQL) dentro
            // desta — se lançar, o stamp acima volta junto. O bônus continua
            // disponível pra próxima tentativa do usuário.
            $this->points->award(
                $user,
                $amount,
                'user.daily_login',
                'user',
                $user->id,
            );
        });
    }
}
