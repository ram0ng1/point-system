// @ts-nocheck
import app from 'flarum/admin/app';

export default function AdminNav(current: string) {
  const links: Array<[string, string, string]> = [
    ['rules', 'fas fa-sliders-h', 'rules'],
    ['users', 'fas fa-users', 'users'],
    ['avatar', 'fas fa-user-circle', 'avatar'],
    ['name', 'fas fa-font', 'name'],
    ['cover', 'fas fa-image', 'cover'],
    ['title', 'fas fa-id-badge', 'title'],
    ['post-hl', 'fas fa-highlighter', 'post_hl'],
    ['groups', 'fas fa-layer-group', 'groups'],
    ['manual', 'fas fa-hand-holding-usd', 'manual'],
    ['submissions', 'fas fa-inbox', 'submissions'],
    ['all-trades', 'fas fa-handshake', 'all_trades'],
  ];

  const base = app.route('extension', { id: 'ramon-point-system' });
  const hrefFor = (tab: string) => (tab === 'rules' ? base : base + '?tab=' + tab);

  return (
    <nav className="PointSystemAdminNav">
      {links.map(([tab, icon, key]) => (
        <a
          key={tab}
          className={'PointSystemAdminNav-link ' + (current === tab ? 'active' : '')}
          href={hrefFor(tab)}
          onclick={(e: MouseEvent) => {
            e.preventDefault();
            m.route.set(hrefFor(tab));
          }}
        >
          <i className={icon} />
          <span>{app.translator.trans('ramon-point-system.admin.tabs.' + key)}</span>
        </a>
      ))}
    </nav>
  );
}
