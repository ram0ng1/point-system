// @ts-nocheck
import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';

/**
 * Shared availability/restriction inputs for every shop-item admin panel.
 *
 * State shape (kept identical across panels — `fillFromAttrs` on the PHP
 * side reads the same set):
 *   - maxClaims:        number | null
 *   - claimCount:       number (read-only, server-managed)
 *   - availableFrom:    ISO string ("" for none)
 *   - availableUntil:   ISO string ("" for none)
 *   - isListed:         boolean
 *   - allowedGroupIds:  number[] ([] = unrestricted)
 *
 * Embeds itself into the parent panel's form. The parent passes a `state`
 * object and an `onchange` callback; the component mutates state in place
 * and calls onchange to trigger a redraw on the parent. This is the same
 * pattern other admin panels use for per-row edit buffers.
 */
export default class AvailabilityInputs extends Component {
  view() {
    const t = (k: string) => app.translator.trans('ramon-point-system.admin.availability.' + k);
    const s = this.attrs.state || {};
    const groups = (app.store.all('groups') as any[]) || [];

    // Coerce ISO datetime → input value (datetime-local needs `YYYY-MM-DDTHH:MM`).
    const toLocal = (iso: string): string => {
      if (!iso) return '';
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    const set = (k: string, v: any) => {
      s[k] = v;
      if (this.attrs.onchange) this.attrs.onchange(s);
      m.redraw();
    };

    const allowed = Array.isArray(s.allowedGroupIds) ? s.allowedGroupIds : [];
    const toggleGroup = (gid: number) => {
      const next = allowed.includes(gid) ? allowed.filter((x: number) => x !== gid) : [...allowed, gid];
      set('allowedGroupIds', next);
    };

    return (
      <fieldset className="PointSystemAdmin-availability">
        <legend>{t('legend')}</legend>

        <div className="Form-group">
          <label>
            <input type="checkbox" checked={s.isListed !== false} onchange={(e: Event) => set('isListed', (e.target as HTMLInputElement).checked)} />{' '}
            {t('is_listed')}
          </label>
          <p className="helpText">{t('is_listed_help')}</p>
        </div>

        <div className="Form-group">
          <label>{t('max_claims')}</label>
          <input
            type="number"
            min="0"
            className="FormControl"
            placeholder={t('max_claims_placeholder') as string}
            value={s.maxClaims ?? ''}
            oninput={(e: Event) => {
              const v = (e.target as HTMLInputElement).value;
              set('maxClaims', v === '' ? null : Math.max(0, Number(v)));
            }}
          />
          <p className="helpText">
            {t('max_claims_help')}{' '}
            {Number(s.claimCount ?? 0) > 0 && (
              <strong>
                {t('claims_so_far')} {Number(s.claimCount ?? 0).toLocaleString()}
              </strong>
            )}
          </p>
        </div>

        <div className="Form-group">
          <label>{t('available_from')}</label>
          <input
            type="datetime-local"
            className="FormControl"
            value={toLocal(s.availableFrom || '')}
            oninput={(e: Event) => {
              const v = (e.target as HTMLInputElement).value;
              set('availableFrom', v ? new Date(v).toISOString() : null);
            }}
          />
        </div>

        <div className="Form-group">
          <label>{t('available_until')}</label>
          <input
            type="datetime-local"
            className="FormControl"
            value={toLocal(s.availableUntil || '')}
            oninput={(e: Event) => {
              const v = (e.target as HTMLInputElement).value;
              set('availableUntil', v ? new Date(v).toISOString() : null);
            }}
          />
          <p className="helpText">{t('dates_help')}</p>
        </div>

        <div className="Form-group">
          <label>{t('allowed_groups')}</label>
          {groups.length === 0 ? (
            <p className="helpText">{t('groups_loading')}</p>
          ) : (
            <div className="PointSystemAdmin-groupPicker">
              {groups
                // Group IDs 1 (Admin) and 2 (Guest) are special — Admin is
                // covered implicitly; Guest cannot purchase. Filter BEFORE
                // map so the resulting list is uniformly keyed: Mithril
                // throws "In fragments, vnodes must either all have keys or
                // none have keys" when a `.map()` mixes keyed vnodes with
                // returned `null` placeholders.
                .filter((g: any) => {
                  const id = Number(g.id?.());
                  return id && id !== 1 && id !== 2;
                })
                .map((g: any) => {
                  const id = Number(g.id());
                  const label = g.nameSingular?.() || g.namePlural?.() || `Group ${id}`;
                  return (
                    <label className="PointSystemAdmin-groupPicker-row" key={id}>
                      <input type="checkbox" checked={allowed.includes(id)} onchange={() => toggleGroup(id)} /> {label}
                    </label>
                  );
                })}
            </div>
          )}
          <p className="helpText">{t('allowed_groups_help')}</p>
        </div>
      </fieldset>
    );
  }
}
