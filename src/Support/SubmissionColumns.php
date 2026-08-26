<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Support;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Sabe se a migration de submissão de usuário (2026_05_16_000004) já rodou
 * numa tabela de decoração — as colunas `status` e `creator_id` chegam
 * juntas, então uma resposta serve para as duas.
 *
 * Existe porque a introspecção de schema é cara: cada `hasColumn` dispara
 * uma consulta em `INFORMATION_SCHEMA`, notoriamente lenta em bancos com
 * muitas tabelas. Antes {@see SubmissionScope} sondava `status` e
 * {@see \Ramon\PointSystem\Api\ForumAttributes} sondava `creator_id`,
 * cada um com o próprio cache — dez introspecções para as cinco tabelas.
 * Aqui é uma por tabela, e o resultado vale para ambos os chamadores.
 *
 * O cache é estático de propósito: o schema não varia por ator nem por
 * requisição, e só muda quando o admin roda `migrate` — que reinicia os
 * workers. Mesmo racional do cache em {@see ItemAvailability}.
 */
final class SubmissionColumns
{
    /** @var array<string, bool> Flag de prontidão por tabela. */
    private static array $cache = [];

    /** Colunas que a migration adiciona; ausência de qualquer uma = não pronta. */
    private const COLUMNS = ['status', 'creator_id'];

    /**
     * True quando a tabela por trás desta query já tem as colunas de
     * submissão. Um fórum que atualizou o código mas ainda não rodou
     * `php flarum migrate` recebe `false` e mantém a semântica antiga.
     */
    public static function readyFor(Builder $query): bool
    {
        return self::ready($query->getModel());
    }

    /** Mesma checagem a partir do model. */
    public static function ready(Model $model): bool
    {
        $table = $model->getTable();

        if (! array_key_exists($table, self::$cache)) {
            try {
                self::$cache[$table] = $model->getConnection()
                    ->getSchemaBuilder()
                    ->hasColumns($table, self::COLUMNS);
            } catch (\Throwable) {
                self::$cache[$table] = false;
            }
        }

        return self::$cache[$table];
    }

    /** Only for tests — drops the memoized schema answers. */
    public static function flush(): void
    {
        self::$cache = [];
    }
}
