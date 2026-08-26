<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Tests\unit;

use Flarum\User\User;
use PHPUnit\Framework\TestCase;
use Ramon\PointSystem\Notification\PointsEarnedBlueprint;

/**
 * Contratos do blueprint de "ganhou pontos". Dois deles quebram em silêncio
 * se alguém mexer sem querer:
 *
 *  - a string de `getType()` precisa bater byte a byte com a chave em
 *    `app.notificationComponents` no frontend, senão a notificação chega,
 *    fica no banco, a API serve — e o card renderiza vazio (§46.2);
 *  - `getData()` é devolvido verbatim pela API, sem nova checagem de
 *    política (§19), e o `reason` vira chave de tradução no frontend: um
 *    valor fora do allowlist viraria string de tradução ausente.
 */
class PointsEarnedBlueprintTest extends TestCase
{
    private function blueprint(int $amount, string $reason): PointsEarnedBlueprint
    {
        $user = new User();
        $user->id = 42;

        return new PointsEarnedBlueprint($user, $amount, $reason);
    }

    public function test_tipo_e_estavel(): void
    {
        $this->assertSame('pointsEarned', PointsEarnedBlueprint::getType());
    }

    /**
     * O frontend despacha o componente pela string do tipo. Um typo em
     * qualquer um dos lados não quebra nada visível — só deixa de renderizar.
     */
    public function test_frontend_registra_exatamente_o_mesmo_tipo(): void
    {
        $index = file_get_contents(__DIR__ . '/../../js/src/forum/index.tsx');

        $this->assertIsString($index);
        $this->assertStringContainsString(
            'app.notificationComponents.' . PointsEarnedBlueprint::getType() . ' =',
            $index,
            'o componente do frontend precisa ser registrado sob a mesma string de getType()',
        );
    }

    public function test_dados_carregam_valor_e_motivo(): void
    {
        $data = $this->blueprint(12, 'like.received')->getData();

        $this->assertSame(['amount' => 12, 'reason' => 'like.received'], $data);
    }

    public function test_motivo_desconhecido_vira_other(): void
    {
        $data = $this->blueprint(5, 'admin.adjustment')->getData();

        $this->assertSame('other', $data['reason']);
    }

    public function test_bonus_e_subconjunto_dos_motivos_conhecidos(): void
    {
        foreach (PointsEarnedBlueprint::BONUS_REASONS as $reason) {
            $this->assertContains($reason, PointsEarnedBlueprint::REASONS);
        }
    }

    /** Ganho por ação não tem remetente — o card mostra a moeda, não um avatar. */
    public function test_sem_remetente(): void
    {
        $this->assertNull($this->blueprint(3, 'post.posted')->getFromUser());
    }

    public function test_assunto_e_o_proprio_usuario(): void
    {
        $b = $this->blueprint(3, 'post.posted');

        $this->assertSame($b->recipient, $b->getSubject());
        $this->assertSame(User::class, PointsEarnedBlueprint::getSubjectModel());
    }
}
