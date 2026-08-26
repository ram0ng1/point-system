import app from 'flarum/forum/app';
import Notification from 'flarum/forum/components/Notification';

/**
 * Card mostrado quando o usuário ganha pontos por uma ação — post, curtida,
 * bônus diário, cadastro. Distinto de `PointsManualNotification`, que é o
 * ajuste feito por um admin e tem um remetente humano no card.
 *
 * O `reason` vem do backend já restrito ao allowlist de
 * `PointsEarnedBlueprint::REASONS` (fora dele vira `other`), então mapear
 * motivo → chave de tradução aqui é seguro: nenhum valor arbitrário chega
 * a virar chave.
 */

const ICONS: Record<string, string> = {
  'discussion.started': 'fas fa-comments',
  'post.posted': 'fas fa-reply',
  'like.received': 'fas fa-heart',
  'like.given': 'fas fa-thumbs-up',
  'user.daily_login': 'fas fa-calendar-check',
  'user.registered': 'fas fa-user-plus',
};

/** Motivo → sufixo da chave de tradução (`notifications.earned_*`). */
const KEYS: Record<string, string> = {
  'discussion.started': 'discussion',
  'post.posted': 'post',
  'like.received': 'like_received',
  'like.given': 'like_given',
  'user.daily_login': 'daily_login',
  'user.registered': 'registered',
};

export default class PointsEarnedNotification extends Notification {
  data(): { amount: number; reason: string } {
    const raw = (this.attrs as any).notification?.content?.() || {};
    const amount = Number(raw?.amount ?? 0);
    return {
      amount: Number.isFinite(amount) ? amount : 0,
      reason: String(raw?.reason ?? 'other'),
    };
  }

  icon(): string {
    return ICONS[this.data().reason] ?? ((app.forum.attribute('pointSystem.currency_icon') as string) || 'fas fa-coins');
  }

  href(): string {
    // Leva à loja: o usuário acabou de ganhar saldo, o passo seguinte
    // natural é ver no que gastar.
    try {
      return app.route('pointSystem.shop');
    } catch {
      return '/';
    }
  }

  /**
   * Abstrato no core, então precisa existir mesmo devolvendo nada: o card
   * do ganho já diz tudo em uma linha e um excerto repetiria a mesma frase.
   */
  excerpt(): string | null {
    return null;
  }

  content() {
    const { amount, reason } = this.data();
    const suffix = KEYS[reason] ?? 'other';
    return app.translator.trans('ramon-point-system.forum.notifications.earned_' + suffix, {
      amount: amount.toLocaleString(),
    });
  }
}
