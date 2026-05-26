// @ts-nocheck
import { safeCssUrl } from '../../common/utils/safeCssUrl';

// `m` is the Flarum-provided global (JSX pragma); don't import from 'mithril'.
declare const m: any;

/**
 * Wraps the avatar vnode with a decoration frame. The frame is a `<span>`
 * pinned absolutely over the avatar element via the `.ps-avatar-deco` class
 * defined in less/forum.less.
 *
 * Critically: Avatar.view returns an `<img>` when the user has an uploaded
 * picture (a self-closing element that can't take children). So we MUTATE
 * the vnode in place into a wrapping `<span>` and demote the original
 * tag/attrs into a fresh child vnode. Both shapes (img and the fallback span)
 * get handled the same way.
 */
interface ApplyAvatarDecorationOptions {
  /*
   * Quando true, anexa um `oncreate` que verifica se o elemento caiu
   * dentro de um `.DiscussionListItem` ou `.AvocadoHome-thread*` e, se
   * cair, desmonta a decoração (remove a classe wrapper + o filho frame).
   * Usado pelo toggle "Quadros de avatar em listas de discussões".
   */
  skipInDiscussionList?: boolean;
}

export function applyAvatarDecoration(vnode: any, frameUrl: string, opts: ApplyAvatarDecorationOptions = {}): void {
  if (!vnode || !frameUrl) return;

  // Don't decorate twice if this view() is re-run on the same vnode.
  if (vnode.attrs?.className?.includes?.('ps-avatar-deco-wrap')) return;

  const innerVnode = {
    tag: vnode.tag,
    attrs: { ...(vnode.attrs || {}) },
    children: vnode.children,
    text: vnode.text,
  };

  const previousOncreate = innerVnode.attrs.oncreate;

  vnode.tag = 'span';
  vnode.attrs = {
    className: 'ps-avatar-deco-wrap ' + (innerVnode.attrs.className || ''),
    style: innerVnode.attrs.style,
    'data-ps-deco': '1',
  };

  /*
   * `skipInDiscussionList` é o ÚNICO contexto que precisa de JS — está
   * gated por uma configuração do admin que pode ser ligada/desligada.
   * Os contextos NEVER_DECORATE (PostPreview, Post-mentionedBy*) viviam
   * aqui também mas geravam "avatar duplicado": ao remover a classe
   * `.ps-avatar-deco-wrap`, perdíamos a regra `background: transparent`
   * E o wrap (que tem `.Avatar` herdado do className do inner) virava
   * um SEGUNDO avatar visível ao lado do inner por causa do
   * `.PostPreview .Avatar { float: left; margin-left: -50px }` de
   * Flarum core (Post.less:348) que aplicava em BOTH wrap e inner.
   * Movido para CSS em forum.less (`.PostPreview .ps-avatar-deco-wrap
   * { display: contents }`) — assim o wrap some do layout e só o inner
   * recebe o estilo do PostPreview. Sem flicker em updates de Mithril,
   * sem duplicação visual.
   */
  const LIST_SELECTOR = '.DiscussionListItem, [class*="AvocadoHome-thread"]';
  vnode.attrs.oncreate = (n: any) => {
    const el = n.dom as HTMLElement | null;
    if (el && opts.skipInDiscussionList && el.closest?.(LIST_SELECTOR)) {
      el.classList.remove('ps-avatar-deco-wrap');
      el.removeAttribute('data-ps-deco');
      const frame = el.querySelector(':scope > .ps-avatar-deco');
      frame?.remove();
    }
    previousOncreate?.(n);
  };

  vnode.text = undefined;
  vnode.children = [
    innerVnode,
    m('span.ps-avatar-deco', {
      style: {
        backgroundImage: `url("${safeCssUrl(frameUrl)}")`,
      },
      'aria-hidden': 'true',
    }),
  ];
}
