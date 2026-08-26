import app from 'flarum/forum/app';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import { pointsLabel } from '../../common/utils/pointsLabel';

/**
 * Painel "Como ganhar pontos". Responde à pergunta que mais chega ao admin
 * pelo suporte do fórum sem exigir que ele escreva um tópico à mão: todas as
 * regras já vêm das configurações do painel administrativo via
 * `serializeToForum`, então o conteúdo acompanha o que o admin configurou.
 *
 * Regras com valor zero não aparecem — anunciar "0 pontos por post" é pior
 * que omitir. Regras de curtida dependem de `pointSystemLikesEnabled`, porque
 * as duas configurações continuam salvas mesmo em fóruns sem flarum/likes.
 */

interface EarnRule {
  key: string;
  icon: string;
  amount: number;
}

export default class HowToEarnModal extends Modal {
  className() {
    return 'PointSystemHowToEarnModal Modal--small';
  }

  title() {
    return app.translator.trans('ramon-point-system.forum.how_to_earn.title');
  }

  content() {
    const t = (k: string, vars?: any) => app.translator.trans('ramon-point-system.forum.how_to_earn.' + k, vars);
    const rules = earnRules();
    const note = adminNote();
    const icon = (app.forum.attribute('pointSystem.currency_icon') as string) || 'fas fa-coins';

    return (
      <div className="Modal-body PointSystemHowToEarn">
        {rules.length > 0 && <p className="PointSystemHowToEarn-intro">{t('intro')}</p>}

        {rules.length > 0 ? (
          <ul className="PointSystemHowToEarn-list">
            {rules.map((rule) => (
              <li className="PointSystemHowToEarn-rule">
                <span className="PointSystemHowToEarn-rule-icon">
                  <i className={rule.icon} aria-hidden="true" />
                </span>
                <span className="PointSystemHowToEarn-rule-label">{t('rule_' + rule.key)}</span>
                <span className="PointSystemHowToEarn-rule-amount">
                  <i className={icon} aria-hidden="true" /> +{rule.amount.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="PointSystemHowToEarn-empty">{t(systemOff() ? 'system_off' : 'no_rules')}</p>
        )}

        {note && <p className="PointSystemHowToEarn-note">{note}</p>}

        {rules.length > 0 && <p className="PointSystemHowToEarn-footer">{t('footer', { unit: pointsLabel(app) })}</p>}

        <div className="Form-group PointSystemHowToEarn-actions">
          <Button className="Button Button--primary" onclick={() => this.hide()}>
            {t('close')}
          </Button>
        </div>
      </div>
    );
  }
}

/**
 * Lê o valor de uma regra do payload do fórum. `intval` no backend garante
 * número, mas um fórum que nunca salvou a configuração devolve `undefined`
 * — daí o fallback explícito em vez de `Number(undefined) === NaN`.
 */
function amount(key: string): number {
  const raw = app.forum.attribute('pointSystem.' + key);
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Chave geral desligada: o fórum não concede ponto nenhum, nem automático
 * nem manual. Mais específico que `autoAwardsOff()` e por isso testado
 * primeiro — as duas mensagens dizem coisas diferentes ao usuário.
 */
export function systemOff(): boolean {
  return app.forum?.attribute?.('pointSystem.enabled') === false;
}

/** True quando o admin desligou "pontos por ação" mas manteve o sistema no ar. */
export function autoAwardsOff(): boolean {
  return app.forum?.attribute?.('pointSystemAutoAwardsEnabled') === false;
}

/** Regras ativas, na ordem em que fazem sentido para quem está começando. */
export function earnRules(): EarnRule[] {
  if (systemOff() || autoAwardsOff()) return [];

  const likes = app.forum.attribute('pointSystemLikesEnabled') === true;

  const candidates: EarnRule[] = [
    { key: 'discussion', icon: 'fas fa-comments', amount: amount('points_per_discussion') },
    { key: 'post', icon: 'fas fa-reply', amount: amount('points_per_post') },
    { key: 'daily_login', icon: 'fas fa-calendar-check', amount: amount('daily_login_bonus') },
    { key: 'registration', icon: 'fas fa-user-plus', amount: amount('points_per_registration') },
  ];

  if (likes) {
    candidates.push(
      { key: 'like_received', icon: 'fas fa-heart', amount: amount('points_per_like_received') },
      { key: 'like_given', icon: 'fas fa-thumbs-up', amount: amount('points_per_like_given') }
    );
  }

  return candidates.filter((r) => r.amount > 0);
}

/**
 * Nota livre do admin. Renderizada como texto puro pelo Mithril — nunca com
 * `m.trust` — então HTML colado na configuração aparece escapado.
 */
export function adminNote(): string {
  const raw = app.forum.attribute('pointSystem.earn_help_extra');
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * Verdadeiro quando há algo a mostrar. O botão some quando o admin zerou
 * todas as regras e não escreveu nota — abrir um painel vazio é pior que
 * não oferecer o atalho. Nos dois modos desligados o botão FICA: "quem
 * distribui pontos é a equipe" e "o fórum não está concedendo pontos" são
 * exatamente as respostas que o usuário procura nesses estados.
 */
export function hasEarnHelp(): boolean {
  return systemOff() || autoAwardsOff() || earnRules().length > 0 || adminNote() !== '';
}

export type { EarnRule };
