// @ts-nocheck
import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';

/**
 * Username input with autocomplete dropdown.
 * Shows suggestions after 3 characters, matching Flarum's own search behaviour.
 *
 * Attrs:
 *   value:       string               current value
 *   onchange:    (username: string) => void
 *   placeholder: string (optional)
 *   autofocus:   boolean (optional)
 */
export default class UsernameAutocomplete extends Component {
  suggestions: any[] = [];
  open = false;
  searchTimer: any = null;

  oninit(vnode: any) {
    super.oninit(vnode);
  }

  onremove() {
    clearTimeout(this.searchTimer);
  }

  onInput(value: string) {
    this.attrs.onchange(value);
    clearTimeout(this.searchTimer);

    if (value.trim().length < 3) {
      this.suggestions = [];
      this.open = false;
      m.redraw();
      return;
    }

    this.searchTimer = setTimeout(async () => {
      try {
        const res = await app.store.find('users', {
          filter: { q: value.trim() },
          page: { limit: 5 },
        });
        this.suggestions = Array.isArray(res) ? res : [];
        this.open = this.suggestions.length > 0;
      } catch {
        this.suggestions = [];
        this.open = false;
      }
      m.redraw();
    }, 300);
  }

  select(user: any) {
    const name = user.username?.() || '';
    this.attrs.onchange(name);
    this.suggestions = [];
    this.open = false;
    m.redraw();
  }

  view() {
    return (
      <div className="UsernameAutocomplete" style="position: relative;">
        <input
          type="text"
          className="FormControl"
          value={this.attrs.value}
          placeholder={this.attrs.placeholder || ''}
          autofocus={this.attrs.autofocus || false}
          oninput={(e: Event) => this.onInput((e.target as HTMLInputElement).value)}
          onblur={() =>
            setTimeout(() => {
              this.open = false;
              m.redraw();
            }, 150)
          }
        />
        {this.open && (
          <ul className="UsernameAutocomplete-dropdown">
            {this.suggestions.map((user: any) => {
              const username = user.username?.() || '';
              const displayName = user.displayName?.() || username;
              const avatarUrl = user.avatarUrl?.();
              return (
                <li key={user.id()} onmousedown={() => this.select(user)}>
                  {avatarUrl ? <img className="Avatar" src={avatarUrl} alt="" /> : <span className="Avatar">{username.charAt(0).toUpperCase()}</span>}
                  <span className="UsernameAutocomplete-name">{displayName}</span>
                  {displayName !== username && <span className="UsernameAutocomplete-username">@{username}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }
}
