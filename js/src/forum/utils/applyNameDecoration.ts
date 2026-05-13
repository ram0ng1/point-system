// @ts-nocheck

/**
 * Adds a CSS hook class onto a vnode's root element so that the `.username`
 * (rendered by `flarum/common/helpers/username`) inside can be styled by one
 * of the preset decoration rules defined in `less/common/decorations.less`.
 *
 * Used to wrap CommentPost / UserCard view roots.
 */
export function applyNameDecorationClass(vnode: any, user: any): void {
  if (!vnode || !user) return;

  const slug = user?.attribute?.('equippedNameDecorationSlug');
  if (!slug) return;

  const cleanSlug = String(slug).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleanSlug) return;

  vnode.attrs = vnode.attrs || {};
  const existing = String(vnode.attrs.className || '');
  if (existing.includes(`ps-name-${cleanSlug}`)) return;
  vnode.attrs.className = `${existing} ps-name-${cleanSlug}`.trim();
}
