// @ts-nocheck
import app from 'flarum/forum/app';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import Input from 'flarum/common/components/Input';
import UserSearchResult from 'flarum/common/components/UserSearchResult';
import TradeModal from './TradeModal';

const SEARCH_DEBOUNCE_MS = 200;
const SUGGESTION_LIMIT = 6;

/**
 * Small picker modal opened from the TradesPage. Live-searches Flarum
 * users (same JSON:API filter the @-mentions composer uses) as the actor
 * types, then hands off to the full TradeModal when one is picked.
 *
 * The earlier version asked the user to type the exact username and
 * resolved it on submit — fine for power users, awful for everyone else
 * who can only remember part of a display name. Autocomplete here mirrors
 * the mentions/typeahead UX so the modal feels native.
 */
export default class StartTradeModal extends Modal {
  query = '';
  busy = false;
  err = '';
  suggestions: any[] = [];
  searching = false;
  highlight = 0;
  searchTimer: any = null;
  selected: any = null;

  className() {
    return 'PointSystemStartTradeModal Modal--small';
  }

  title() {
    return app.translator.trans('ramon-point-system.forum.trades_page.start_title');
  }

  onremove(vnode: any) {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    super.onremove?.(vnode);
  }

  content() {
    const t = (k: string) => app.translator.trans('ramon-point-system.forum.trades_page.' + k);
    const showSuggestions = this.query.trim().length >= 1 && !this.selected;

    return (
      <div className="Modal-body">
        <p className="helpText">{t('start_help')}</p>

        <div className="Form-group PointSystemStartTradeModal-search">
          <label>{t('start_username_label')}</label>
          {/* Flarum v2's native search bar: the core `Input` component renders
              a magnifier prefix icon, a clear (×) button, and an inline loading
              spinner — same look as the forum's global search. */}
          <Input
            className="PointSystemStartTradeModal-searchInput"
            type="search"
            prefixIcon="fas fa-magnifying-glass"
            clearable={!!(this.query || this.selected)}
            clearLabel={t('start_clear') as string}
            loading={this.searching}
            ariaLabel={t('start_username_label') as string}
            placeholder={t('start_username_placeholder') as string}
            value={this.selected ? this.formatPicked(this.selected) : this.query}
            onchange={(value: string) => this.onQueryInput(value)}
            inputAttrs={{
              autocomplete: 'off',
              autofocus: true,
              role: 'combobox',
              'aria-autocomplete': 'list',
              'aria-expanded': showSuggestions,
              onkeydown: (e: KeyboardEvent) => this.onKeyDown(e),
              onfocus: () => {
                if (this.selected) {
                  // Clear selection on re-focus so the user can search again.
                  this.query = String(this.selected.username?.() ?? '');
                  this.selected = null;
                }
              },
            }}
          />
          {showSuggestions && this.renderSuggestions()}
        </div>

        {this.err && (
          <p className="PointSystemStartTradeModal-error">
            <i className="fas fa-exclamation-triangle" /> {this.err}
          </p>
        )}

        <div className="Form-group PointSystemStartTradeModal-actions">
          <Button className="Button" onclick={() => this.hide()}>
            {app.translator.trans('ramon-point-system.forum.trades_page.start_cancel')}
          </Button>
          <Button className="Button Button--primary" loading={this.busy} disabled={!this.selected || this.busy} onclick={() => this.submit()}>
            <i className="fas fa-handshake" /> {app.translator.trans('ramon-point-system.forum.trades_page.start_submit')}
          </Button>
        </div>
      </div>
    );
  }

  renderSuggestions() {
    const t = (k: string) => app.translator.trans('ramon-point-system.forum.trades_page.' + k);
    const hasResults = this.suggestions.length > 0;
    const showNotFound = !this.searching && !hasResults && this.query.trim().length >= 2;

    // While searching with nothing to show yet, the search bar's own inline
    // spinner is the loading affordance — don't also render an empty box.
    if (!hasResults && !showNotFound) return null;

    return (
      <ul className="PointSystemStartTradeModal-suggestions">
        {showNotFound && <li className="PointSystemStartTradeModal-suggestionStatus">{t('start_not_found')}</li>}
        {this.suggestions.map((u, i) => (
          // Native search-result row (avatar + query-highlighted name + badges).
          // We pass the @handle as a child so it renders to the right — useful
          // for telling apart users who share a display name. `.active` mirrors
          // the keyboard highlight; hover is handled in CSS.
          <UserSearchResult user={u} query={this.query} className={i === this.highlight ? 'active' : ''} onclick={() => this.pick(u)}>
            <span className="PointSystemStartTradeModal-handle">@{u.username?.()}</span>
          </UserSearchResult>
        ))}
      </ul>
    );
  }

  formatPicked(u: any): string {
    const dn = String(u.displayName?.() ?? '');
    const un = String(u.username?.() ?? '');
    return dn && dn !== un ? `${dn} (@${un})` : `@${un}`;
  }

  onQueryInput(value: string) {
    this.query = value;
    this.selected = null;
    this.highlight = 0;
    this.err = '';
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (value.trim().length < 1) {
      this.suggestions = [];
      this.searching = false;
      m.redraw();
      return;
    }
    this.searching = true;
    m.redraw();
    this.searchTimer = setTimeout(() => this.search(value.trim()), SEARCH_DEBOUNCE_MS);
  }

  async search(q: string) {
    try {
      // Flarum's standard users filter — same endpoint the @-mentions
      // composer typeahead uses. Honours blocking/permissions, returns
      // already-hydrated User store records.
      const results = await app.store.find('users', {
        filter: { q },
        page: { limit: SUGGESTION_LIMIT },
      });
      const list = Array.isArray(results) ? results : [];
      // Strip self — user can't trade with themselves; surfacing self in
      // the suggestion list invites a confusing error on submit.
      const me = app.session.user;
      this.suggestions = me ? list.filter((u: any) => Number(u.id?.()) !== Number(me.id?.())) : list;
      this.highlight = 0;
    } catch (e: any) {
      this.suggestions = [];
      const detail = e?.response?.errors?.[0]?.detail || app.translator.trans('ramon-point-system.forum.trades_page.start_search_failed');
      app.alerts.show({ type: 'error' }, detail);
    } finally {
      this.searching = false;
      m.redraw();
    }
  }

  onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (this.suggestions.length === 0) return;
      this.highlight = (this.highlight + 1) % this.suggestions.length;
      m.redraw();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.suggestions.length === 0) return;
      this.highlight = (this.highlight - 1 + this.suggestions.length) % this.suggestions.length;
      m.redraw();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (this.selected) {
        this.submit();
        return;
      }
      const pick = this.suggestions[this.highlight];
      if (pick) {
        this.pick(pick);
      }
      return;
    }
    if (e.key === 'Escape') {
      // Let the modal handle close — don't preventDefault.
      return;
    }
  }

  pick(u: any) {
    this.selected = u;
    this.suggestions = [];
    this.err = '';
    m.redraw();
  }

  async submit() {
    if (!this.selected) {
      // Backstop: if Enter is pressed before a pick is made, try resolving
      // the raw query (single result OR exact-match disambiguation).
      const q = this.query.trim();
      if (!q) return;
      this.busy = true;
      this.err = '';
      m.redraw();
      try {
        const found = await app.store.find('users', { filter: { q }, page: { limit: 5 } });
        const list = Array.isArray(found) ? found : [];
        const match =
          list.find((u: any) => {
            const un = String(u.username?.() ?? '').toLowerCase();
            const dn = String(u.displayName?.() ?? '').toLowerCase();
            const ql = q.toLowerCase();
            return un === ql || dn === ql;
          }) || list[0];
        if (!match) {
          this.err = app.translator.trans('ramon-point-system.forum.trades_page.start_not_found') as string;
          return;
        }
        this.selected = match;
      } catch (e: any) {
        this.err = e?.response?.errors?.[0]?.detail || 'Failed';
        return;
      } finally {
        this.busy = false;
      }
    }

    const me = app.session.user;
    if (me && Number(me.id?.()) === Number(this.selected.id?.())) {
      this.err = app.translator.trans('ramon-point-system.forum.trade.error_cannot_trade_with_self') as string;
      m.redraw();
      return;
    }

    // Hand off to the full trade modal.
    this.hide();
    app.modal.show(TradeModal, { target: this.selected });
  }
}
