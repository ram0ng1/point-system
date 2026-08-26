<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Tests\unit;

use Flarum\Settings\SettingsRepositoryInterface;
use PHPUnit\Framework\TestCase;
use Ramon\PointSystem\FeatureGate;
use Ramon\PointSystem\Model\ShopClaim;

/**
 * A chave geral (`point-system.enabled`) desliga a CONCESSÃO de pontos e
 * nada além disso: gastar, trocar e exibir decoração continuam de pé, senão
 * desligá-la confiscaria na prática o que os usuários já ganharam. Estes
 * testes travam a fronteira nos dois sentidos — o que cai junto com ela e,
 * mais importante, o que NÃO pode cair.
 */
class FeatureGateTest extends TestCase
{
    private function gate(array $settings): FeatureGate
    {
        $repo = new class($settings) implements SettingsRepositoryInterface {
            public function __construct(private array $data) {}
            public function all(): array { return $this->data; }
            public function get(string $key, mixed $default = null): mixed { return $this->data[$key] ?? $default; }
            public function set(string $key, mixed $value): void { $this->data[$key] = $value; }
            public function delete(string $keyLike): void { unset($this->data[$keyLike]); }
        };

        return new FeatureGate($repo);
    }

    public function test_tudo_ligado_por_padrao(): void
    {
        $gate = $this->gate([]);

        $this->assertTrue($gate->isSystemEnabled());
        $this->assertTrue($gate->isEnabled(ShopClaim::TYPE_AVATAR));
        $this->assertTrue($gate->isTradeEnabled());
        $this->assertTrue($gate->areAutoAwardsEnabled());
    }

    /** O que a chave geral derruba: a concessão automática de pontos. */
    public function test_chave_geral_desliga_a_concessao(): void
    {
        $gate = $this->gate(['point-system.enabled' => false]);

        $this->assertFalse($gate->isSystemEnabled());
        $this->assertFalse($gate->areAutoAwardsEnabled());
    }

    /**
     * O que a chave geral NÃO derruba. Desligar a concessão não pode fechar
     * a loja nem apagar decoração equipada: o usuário perderia acesso ao que
     * já tinha comprado. Este teste é o guarda-corpo dessa fronteira.
     */
    public function test_chave_geral_nao_derruba_gasto_nem_exibicao(): void
    {
        $gate = $this->gate(['point-system.enabled' => false]);

        $this->assertTrue($gate->isEnabled(ShopClaim::TYPE_AVATAR));
        $this->assertTrue($gate->isEnabled(ShopClaim::TYPE_NAME));
        $this->assertTrue($gate->isEnabled(ShopClaim::TYPE_COVER));
        $this->assertTrue($gate->isEnabled(ShopClaim::TYPE_TITLE));
        $this->assertTrue($gate->isEnabled(ShopClaim::TYPE_POST_HL));
        $this->assertTrue($gate->isTradeEnabled());
    }

    /** Endpoints de premiação recusam com 403 em vez de virar no-op silencioso. */
    public function test_chave_geral_desligada_recusa_a_requisicao(): void
    {
        $this->expectException(\Flarum\User\Exception\PermissionDeniedException::class);

        $this->gate(['point-system.enabled' => false])->assertSystemEnabled();
    }

    /**
     * Desligar as regras automáticas NÃO derruba o resto: é o modo "só a
     * equipe distribui pontos", em que a loja e as trocas seguem abertas.
     */
    public function test_regras_automaticas_desligam_sozinhas(): void
    {
        $gate = $this->gate(['point-system.auto_awards_enabled' => false]);

        $this->assertFalse($gate->areAutoAwardsEnabled());
        $this->assertTrue($gate->isSystemEnabled());
        $this->assertTrue($gate->isTradeEnabled());
        $this->assertTrue($gate->isEnabled(ShopClaim::TYPE_AVATAR));
    }

    public function test_submissoes_seguem_desligadas_por_padrao(): void
    {
        $this->assertFalse($this->gate([])->isUserSubmissionsEnabled());
    }
}
