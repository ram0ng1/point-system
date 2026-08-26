<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Tests\unit;

use PHPUnit\Framework\TestCase;
use Ramon\PointSystem\Api\UserFields;

/**
 * O manifesto de eager-load é o que impede o post stream de disparar um
 * SELECT em `point_system_user_points` por autor. O EloquentBuffer só aplica
 * relações registradas como `<relação>.<caminho>`, então o prefixo precisa
 * ser exato — um erro aqui volta o N+1 em silêncio, sem quebrar nada
 * visível. Medição de 2026-08-25: 8 autores = 8 queries antes, 1 depois.
 */
class UserFieldsEagerLoadTest extends TestCase
{
    public function test_manifesto_cobre_saldo_e_as_cinco_decoracoes(): void
    {
        $this->assertContains('pointsBalance', UserFields::EAGER_LOAD);

        foreach (['avatar', 'name', 'cover', 'title', 'postHighlight'] as $family) {
            $this->assertContains(
                'pointsBalance.' . $family . 'Decoration',
                UserFields::EAGER_LOAD,
                "faltou eager-load da decoração '$family'",
            );
        }
    }

    public function test_prefixo_da_relacao_e_aplicado_a_todo_caminho(): void
    {
        $paths = UserFields::eagerLoadVia('user');

        $this->assertSame(count(UserFields::EAGER_LOAD), count($paths));
        $this->assertContains('user.pointsBalance', $paths);
        $this->assertContains('user.pointsBalance.titleDecoration', $paths);

        foreach ($paths as $path) {
            $this->assertStringStartsWith('user.', $path);
        }
    }

    public function test_prefixos_diferentes_nao_se_misturam(): void
    {
        $this->assertContains('lastPostedUser.pointsBalance', UserFields::eagerLoadVia('lastPostedUser'));
        $this->assertContains('fromUser.pointsBalance', UserFields::eagerLoadVia('fromUser'));
        $this->assertNotContains('user.pointsBalance', UserFields::eagerLoadVia('fromUser'));
    }
}
