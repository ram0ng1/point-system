<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Notification;

use Flarum\Database\AbstractModel;
use Flarum\Notification\AlertableInterface;
use Flarum\Notification\Blueprint\BlueprintInterface;
use Flarum\User\User;

/**
 * Disparado quando o usuário ganha pontos por uma AÇÃO — abrir discussão,
 * responder, receber/dar curtida, bônus diário, bônus de cadastro. O ajuste
 * manual do admin tem blueprint próprio ({@see PointsManualBlueprint}), com
 * texto e ícone diferentes, porque "a equipe te deu pontos" e "você ganhou
 * pontos postando" são eventos distintos para quem lê.
 *
 * O `reason` do repositório (`post.posted`, `like.received`, …) viaja no
 * `data` e vira a chave de tradução no frontend. É valor de código, nunca
 * texto de usuário — mas passa por um allowlist mesmo assim, porque
 * `data` é devolvido verbatim pela API sem nova checagem de política
 * (CLAUDE.md §19) e uma chave inesperada aqui viraria chave de tradução
 * quebrada na interface.
 *
 * NÃO há dedupe: `Notification::matchingBlueprint` compara também a coluna
 * `data`, então cada concessão com valor/motivo diferente cria uma linha
 * nova. É o comportamento desejado (o usuário vê cada ganho), e é também a
 * razão de a configuração `notify_on_award` existir — ver o listener.
 */
class PointsEarnedBlueprint implements BlueprintInterface, AlertableInterface
{
    public const TYPE = 'pointsEarned';

    /**
     * Motivos que este blueprint aceita. Espelha os `reason` passados ao
     * `award()` pelos cinco listeners automáticos; qualquer outro valor é
     * normalizado para `other` em vez de virar chave de tradução ausente.
     */
    public const REASONS = [
        'discussion.started',
        'post.posted',
        'like.received',
        'like.given',
        'user.daily_login',
        'user.registered',
    ];

    /** Motivos considerados "bônus" — baixa frequência, sem relação 1:1 com uma ação de conteúdo. */
    public const BONUS_REASONS = [
        'user.daily_login',
        'user.registered',
    ];

    public function __construct(
        public User $recipient,
        public int $amount,
        public string $reason,
    ) {}

    #[\Override]
    public function getSubject(): ?AbstractModel
    {
        return $this->recipient;
    }

    /**
     * Sem remetente: ninguém "enviou" o ganho, ele é consequência da ação do
     * próprio usuário. O card do frontend renderiza o ícone da moeda em vez
     * de um avatar.
     */
    #[\Override]
    public function getFromUser(): ?User
    {
        return null;
    }

    #[\Override]
    public function getData(): mixed
    {
        return [
            'amount' => $this->amount,
            'reason' => in_array($this->reason, self::REASONS, true) ? $this->reason : 'other',
        ];
    }

    #[\Override]
    public static function getType(): string
    {
        return self::TYPE;
    }

    #[\Override]
    public static function getSubjectModel(): string
    {
        return User::class;
    }
}
