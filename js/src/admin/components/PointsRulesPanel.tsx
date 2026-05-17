// @ts-nocheck
import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';
import Switch from 'flarum/common/components/Switch';
import Button from 'flarum/common/components/Button';

// Settings grouped into themed sections — keeps the page navigable and
// stops the previous flat-grid layout from breaking when a help text was
// long enough to overflow a column.
//
// Section schema:
//   transKey  → maps to ramon-point-system.admin.rules.section_<key>_{title,help}
//   intro     → optional sub-help paragraph at the top of the section
//   fields    → list of settings (same shape as before).
interface FieldDef {
  key: string;
  transKey: string;
  type: 'number' | 'text' | 'bool' | 'icon';
  defaultBool?: boolean;
}
interface SectionDef {
  transKey: string;
  fields: FieldDef[];
}

const SECTIONS: SectionDef[] = [
  {
    transKey: 'general',
    fields: [
      { key: 'point-system.enabled', transKey: 'enabled', type: 'bool', defaultBool: true },
      { key: 'point-system.lifetime_enabled', transKey: 'lifetime_enabled', type: 'bool', defaultBool: true },
      { key: 'point-system.auto_group_enabled', transKey: 'auto_group_enabled', type: 'bool', defaultBool: true },
      { key: 'point-system.trade_enabled', transKey: 'trade_enabled', type: 'bool', defaultBool: true },
      { key: 'point-system.user_submissions_enabled', transKey: 'user_submissions_enabled', type: 'bool', defaultBool: false },
    ],
  },
  {
    transKey: 'currency',
    fields: [
      { key: 'point-system.currency_name', transKey: 'currency_name', type: 'text' },
      { key: 'point-system.currency_icon', transKey: 'currency_icon', type: 'icon' },
      { key: 'point-system.points_short', transKey: 'points_short', type: 'text' },
    ],
  },
  {
    transKey: 'decorations',
    fields: [
      { key: 'point-system.avatar_deco_enabled', transKey: 'avatar_deco_enabled', type: 'bool', defaultBool: true },
      { key: 'point-system.name_deco_enabled', transKey: 'name_deco_enabled', type: 'bool', defaultBool: true },
      { key: 'point-system.cover_deco_enabled', transKey: 'cover_deco_enabled', type: 'bool', defaultBool: true },
      { key: 'point-system.title_deco_enabled', transKey: 'title_deco_enabled', type: 'bool', defaultBool: true },
      { key: 'point-system.post_hl_deco_enabled', transKey: 'post_hl_deco_enabled', type: 'bool', defaultBool: true },
    ],
  },
  {
    transKey: 'placement',
    fields: [
      { key: 'point-system.show_in_post_header', transKey: 'show_in_post_header', type: 'bool', defaultBool: true },
      { key: 'point-system.show_in_user_profile', transKey: 'show_in_user_profile', type: 'bool', defaultBool: true },
      { key: 'point-system.deco_in_posts', transKey: 'deco_in_posts', type: 'bool', defaultBool: true },
      { key: 'point-system.deco_in_user_card', transKey: 'deco_in_user_card', type: 'bool', defaultBool: true },
      { key: 'point-system.deco_in_lists', transKey: 'deco_in_lists', type: 'bool', defaultBool: true },
      { key: 'point-system.hide_badges_with_avatar_deco', transKey: 'hide_badges_with_avatar_deco', type: 'bool', defaultBool: false },
    ],
  },
  {
    transKey: 'awards',
    fields: [
      { key: 'point-system.points_per_discussion', transKey: 'points_per_discussion', type: 'number' },
      { key: 'point-system.points_per_post', transKey: 'points_per_post', type: 'number' },
      { key: 'point-system.points_per_like_received', transKey: 'points_per_like_received', type: 'number' },
      { key: 'point-system.points_per_like_given', transKey: 'points_per_like_given', type: 'number' },
      { key: 'point-system.points_per_registration', transKey: 'points_per_registration', type: 'number' },
      { key: 'point-system.daily_login_bonus', transKey: 'daily_login_bonus', type: 'number' },
    ],
  },
];

export default class PointsRulesPanel extends Component {
  saving = false;
  dirty: Record<string, any> = {};

  view() {
    return (
      <div className="PointSystemAdmin-section">
        <div className="PointSystemAdmin-section-header">
          <h2>{app.translator.trans('ramon-point-system.admin.rules.title')}</h2>
          <p className="helpText">{app.translator.trans('ramon-point-system.admin.rules.help')}</p>
        </div>

        {SECTIONS.map((s) => this.renderSection(s))}

        <div className="PointSystemAdmin-actions PointSystemAdmin-actions--sticky">
          <Button
            className="Button Button--primary"
            loading={this.saving}
            disabled={Object.keys(this.dirty).length === 0}
            onclick={() => this.save()}
          >
            <i className="fas fa-save" /> {app.translator.trans('ramon-point-system.admin.rules.save')}
          </Button>
          {Object.keys(this.dirty).length > 0 && (
            <span className="PointSystemAdmin-dirty">
              <i className="fas fa-circle" />{' '}
              {app.translator.trans('ramon-point-system.admin.rules.unsaved', { count: Object.keys(this.dirty).length })}
            </span>
          )}
        </div>
      </div>
    );
  }

  renderSection(section: SectionDef) {
    const title = app.translator.trans(`ramon-point-system.admin.rules.section_${section.transKey}_title`);
    const help = app.translator.trans(`ramon-point-system.admin.rules.section_${section.transKey}_help`);
    // Booleans get their own visually-distinct list (one row each, label
    // + help inline) instead of a 2-column grid that was wrapping long
    // descriptions awkwardly. Number/text fields stay in a 2-column grid
    // because they're naturally short.
    const bools = section.fields.filter((f) => f.type === 'bool');
    const others = section.fields.filter((f) => f.type !== 'bool');

    return (
      <div className="PointSystemAdmin-card">
        <div className="PointSystemAdmin-card-header">
          <h3>{title}</h3>
          {help && <p className="helpText">{help}</p>}
        </div>
        {bools.length > 0 && <div className="PointSystemAdmin-toggleList">{bools.map((f) => this.renderField(f))}</div>}
        {others.length > 0 && <div className="PointSystemAdmin-fieldGrid">{others.map((f) => this.renderField(f))}</div>}
      </div>
    );
  }

  renderField(s: FieldDef) {
    const stored = app.data.settings[s.key];
    const current = this.dirty[s.key] ?? stored ?? '';
    const label = app.translator.trans(`ramon-point-system.admin.rules.${s.transKey}`);
    const help = app.translator.trans(`ramon-point-system.admin.rules.${s.transKey}_help`);

    if (s.type === 'bool') {
      const checked =
        this.dirty[s.key] !== undefined
          ? this.dirty[s.key] === '1' || this.dirty[s.key] === true
          : stored === undefined
            ? s.defaultBool === true
            : stored === true || stored === '1' || stored === 1 || stored === 'true';
      return (
        <div className="PointSystemAdmin-toggleRow">
          <Switch state={checked} onchange={(v: boolean) => (this.dirty[s.key] = v ? '1' : '0')}>
            <span className="PointSystemAdmin-toggleRow-label">{label}</span>
            {help && <span className="PointSystemAdmin-toggleRow-help">{help}</span>}
          </Switch>
        </div>
      );
    }

    if (s.type === 'number') {
      return (
        <div className="Form-group PointSystemAdmin-field">
          <label>{label}</label>
          <input
            type="number"
            className="FormControl"
            min="0"
            step="1"
            value={current}
            oninput={(e: Event) => (this.dirty[s.key] = (e.target as HTMLInputElement).value)}
          />
          {help && <p className="helpText">{help}</p>}
        </div>
      );
    }

    return (
      <div className="Form-group PointSystemAdmin-field">
        <label>{label}</label>
        <input
          type="text"
          className="FormControl"
          value={current}
          placeholder={s.type === 'icon' ? 'fas fa-coins' : ''}
          oninput={(e: Event) => (this.dirty[s.key] = (e.target as HTMLInputElement).value)}
        />
        {help && <p className="helpText">{help}</p>}
      </div>
    );
  }

  async save() {
    if (Object.keys(this.dirty).length === 0) return;
    this.saving = true;
    m.redraw();
    try {
      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
      await app.request({ method: 'POST', url: `${apiUrl}/settings`, body: this.dirty });
      Object.assign(app.data.settings, this.dirty);
      this.dirty = {};
      app.alerts.show({ type: 'success' }, app.translator.trans('core.admin.basics.saved_message'));
    } catch (e) {
      app.alerts.show({ type: 'error' }, 'Save failed');
    } finally {
      this.saving = false;
      m.redraw();
    }
  }
}
