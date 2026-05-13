// @ts-nocheck
import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';

const PAGE_SIZE = 20;

/**
 * Browse all users with their point balance / lifetime totals.
 *
 * Server side uses Flarum's standard `users` JSON:API endpoint, which already
 * supports `filter[q]` and offset/limit pagination. The `pointBalance` and
 * `pointLifetime` attributes come from our UserFields extender, so they ride
 * along with every user model in the response.
 */
export default class UsersPointsPanel extends Component {
  loading = false;
  users: any[] = [];
  total = 0;
  page = 0; // zero-indexed
  search = '';
  filter: 'all' | 'positive' | 'zero' = 'all';
  sort: 'balance' | 'lifetime' | 'username' = 'balance';

  oninit(vnode: any) {
    super.oninit(vnode);
    this.load();
  }

  async load() {
    this.loading = true;
    m.redraw();

    const params: any = {
      page: {
        offset: this.page * PAGE_SIZE,
        limit: PAGE_SIZE,
      },
    };
    if (this.search.trim()) {
      params.filter = { q: this.search.trim() };
    }
    // Best-effort sort; if backend doesn't recognise, it just falls back.
    params.sort = this.sort === 'username' ? 'username' : '-username';

    try {
      const res = await app.store.find('users', params);
      let arr = Array.isArray(res) ? res.slice() : [];
      this.total = (res as any)?.payload?.meta?.total ?? arr.length;

      // Filter & sort client-side (the API doesn't expose pointBalance as a
      // sortable column, so we sort/filter the current page locally).
      if (this.filter === 'positive') arr = arr.filter((u: any) => Number(u.attribute('pointBalance') ?? 0) > 0);
      else if (this.filter === 'zero') arr = arr.filter((u: any) => Number(u.attribute('pointBalance') ?? 0) === 0);

      arr.sort((a: any, b: any) => {
        if (this.sort === 'balance') return Number(b.attribute('pointBalance') ?? 0) - Number(a.attribute('pointBalance') ?? 0);
        if (this.sort === 'lifetime') return Number(b.attribute('pointLifetime') ?? 0) - Number(a.attribute('pointLifetime') ?? 0);
        return String(a.username() || '').localeCompare(String(b.username() || ''));
      });

      this.users = arr;
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Failed to load users');
      this.users = [];
    } finally {
      this.loading = false;
      m.redraw();
    }
  }

  view() {
    const t = (k: string, vars?: any) => app.translator.trans('ramon-point-system.admin.users.' + k, vars);
    const totalPages = Math.max(1, Math.ceil(this.total / PAGE_SIZE));

    return (
      <div className="PointSystemAdmin-section">
        <div className="PointSystemAdmin-section-header">
          <h2>{t('title')}</h2>
          <p className="helpText">{t('help')}</p>
        </div>

        <div className="PointSystemAdmin-usersToolbar">
          <input
            type="search"
            className="FormControl PointSystemAdmin-usersSearch"
            placeholder={t('search_placeholder') as string}
            value={this.search}
            oninput={(e: Event) => (this.search = (e.target as HTMLInputElement).value)}
            onkeydown={(e: KeyboardEvent) => {
              if (e.key === 'Enter') { this.page = 0; this.load(); }
            }}
          />
          <select
            className="FormControl PointSystemAdmin-usersFilter"
            value={this.filter}
            onchange={(e: Event) => { this.filter = (e.target as HTMLSelectElement).value as any; this.load(); }}
          >
            <option value="all">{t('filter_all')}</option>
            <option value="positive">{t('filter_positive')}</option>
            <option value="zero">{t('filter_zero')}</option>
          </select>
          <select
            className="FormControl PointSystemAdmin-usersFilter"
            value={this.sort}
            onchange={(e: Event) => { this.sort = (e.target as HTMLSelectElement).value as any; this.load(); }}
          >
            <option value="balance">{t('sort_balance')}</option>
            <option value="lifetime">{t('sort_lifetime')}</option>
            <option value="username">{t('sort_username')}</option>
          </select>
          <Button className="Button" onclick={() => { this.page = 0; this.load(); }}>
            <i className="fas fa-search" /> {t('apply')}
          </Button>
        </div>

        {this.loading ? (
          <LoadingIndicator />
        ) : this.users.length === 0 ? (
          <p className="PointSystemAdmin-empty">{t('no_results')}</p>
        ) : (
          <table className="PointSystemAdmin-table">
            <thead>
              <tr>
                <th>{t('col_user')}</th>
                <th>{t('col_balance')}</th>
                <th>{t('col_lifetime')}</th>
                <th>{t('col_groups')}</th>
              </tr>
            </thead>
            <tbody>
              {this.users.map((u: any) => this.renderRow(u))}
            </tbody>
          </table>
        )}

        <div className="PointSystemAdmin-pagination">
          <Button
            className="Button"
            disabled={this.page === 0 || this.loading}
            onclick={() => { this.page = Math.max(0, this.page - 1); this.load(); }}
          >
            <i className="fas fa-chevron-left" /> {t('prev')}
          </Button>
          <span className="PointSystemAdmin-pageInfo">
            {t('page_x_of_y', { x: this.page + 1, y: totalPages })}
          </span>
          <Button
            className="Button"
            disabled={this.page + 1 >= totalPages || this.loading}
            onclick={() => { this.page = this.page + 1; this.load(); }}
          >
            {t('next')} <i className="fas fa-chevron-right" />
          </Button>
        </div>
      </div>
    );
  }

  renderRow(user: any) {
    const username = user.username?.() || '—';
    const displayName = user.displayName?.() || username;
    const balance = Number(user.attribute('pointBalance') ?? 0);
    const lifetime = Number(user.attribute('pointLifetime') ?? 0);
    const groups = (user.groups?.() || []).filter(Boolean).map((g: any) => g.namePlural?.() || g.nameSingular?.() || '').join(', ');
    const avatarUrl = user.avatarUrl?.();

    return (
      <tr>
        <td>
          <div className="PointSystemAdmin-usersRowUser">
            {avatarUrl ? <img className="Avatar" src={avatarUrl} alt="" /> : <span className="Avatar">{username.charAt(0).toUpperCase()}</span>}
            <div>
              <strong>{displayName}</strong>
              <small>@{username}</small>
            </div>
          </div>
        </td>
        <td><strong>{balance.toLocaleString()}</strong></td>
        <td>{lifetime.toLocaleString()}</td>
        <td><small>{groups}</small></td>
      </tr>
    );
  }
}
