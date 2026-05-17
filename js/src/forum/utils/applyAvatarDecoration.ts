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
export function applyAvatarDecoration(vnode: any, frameUrl: string): void {
  if (!vnode || !frameUrl) return;

  // Don't decorate twice if this view() is re-run on the same vnode.
  if (vnode.attrs?.className?.includes?.('ps-avatar-deco-wrap')) return;

  const innerVnode = {
    tag: vnode.tag,
    attrs: { ...(vnode.attrs || {}) },
    children: vnode.children,
    text: vnode.text,
  };

  vnode.tag = 'span';
  vnode.attrs = {
    className: 'ps-avatar-deco-wrap ' + (innerVnode.attrs.className || ''),
    style: innerVnode.attrs.style,
    'data-ps-deco': '1',
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
