// @ts-nocheck
import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';

export default class AutoGroupTiersPanel extends Component {
  loading = true;
  items: any[] = [];

  draft = { groupId: 0, pointsRequired: 100 };

  oninit(vnode: any) {
    super.oninit(vnode);
    this.load();
  }

  async load() {
    this.loading = true;
    try {
      const res = await app.store.find('point-system-auto-group-tiers');
      this.items = Array.isArray(res) ? res.slice() : [];
    } finally {
      this.loading = false;
      m.redraw();
    }
  }

  view() {
    if (this.loading) return <LoadingIndicator />;

    const groups = app.store.all('groups').filter((g: any) => g.id() > 3); // skip core admin/guest/member
    const usedGroupIds = new Set(this.items.map((i) => i.attribute('groupId')));
    const availableGroups = groups.filter((g: any) => !usedGroupIds.has(Number(g.id())));

    return (
      <div className="PointSystemAdmin-section">
        <div className="PointSystemAdmin-section-header">
          <h2>{app.translator.trans('ramon-point-system.admin.groups.title')}</h2>
          <p className="helpText">{app.translator.trans('ramon-point-system.admin.groups.help')}</p>
        </div>

        <div className="PointSystemAdmin-uploader">
          <h3>{app.translator.trans('ramon-point-system.admin.groups.create')}</h3>
          <div className="Form-group">
            <label>{app.translator.trans('ramon-point-system.admin.groups.field_group')}</label>
            <select
              className="FormControl"
              value={this.draft.groupId}
              onchange={(e: Event) => (this.draft.groupId = Number((e.target as HTMLSelectElement).value))}
            >
              <option value="0">{app.translator.trans('ramon-point-system.admin.groups.choose_group')}</option>
              {availableGroups.map((g: any) => (
                <option value={g.id()}>{g.namePlural()}</option>
              ))}
            </select>
          </div>
          <div className="Form-group">
            <label>{app.translator.trans('ramon-point-system.admin.groups.field_points')}</label>
            <input
              type="number"
              min="0"
              className="FormControl"
              value={this.draft.pointsRequired}
              oninput={(e: Event) => (this.draft.pointsRequired = Number((e.target as HTMLInputElement).value))}
            />
          </div>
          <Button className="Button Button--primary" disabled={!this.draft.groupId} onclick={() => this.create()}>
            {app.translator.trans('ramon-point-system.admin.groups.add')}
          </Button>
        </div>

        <h3>{app.translator.trans('ramon-point-system.admin.groups.existing')}</h3>
        {this.items.length === 0 && <p className="PointSystemAdmin-empty">{app.translator.trans('ramon-point-system.admin.groups.none')}</p>}
        <table className="PointSystemAdmin-table">
          <thead>
            <tr>
              <th>{app.translator.trans('ramon-point-system.admin.groups.col_group')}</th>
              <th>{app.translator.trans('ramon-point-system.admin.groups.col_points')}</th>
              <th>{app.translator.trans('ramon-point-system.admin.groups.col_status')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {this.items
              .slice()
              .sort((a, b) => a.attribute('pointsRequired') - b.attribute('pointsRequired'))
              .map((t) => this.renderRow(t))}
          </tbody>
        </table>
      </div>
    );
  }

  renderRow(tier: any) {
    const group = app.store.getById('groups', tier.attribute('groupId'));
    const enabled = !!tier.attribute('isEnabled');
    return (
      <tr>
        <td>
          <span className="GroupBadge" style={{ backgroundColor: group?.color?.() || '#666' }}>
            <i className={`icon ${group?.icon?.() || 'fas fa-users'}`} />
            {group?.namePlural?.() || `#${tier.attribute('groupId')}`}
          </span>
        </td>
        <td>
          <input
            type="number"
            className="FormControl"
            value={tier.attribute('pointsRequired')}
            min="0"
            onchange={(e: Event) => tier.save({ pointsRequired: Number((e.target as HTMLInputElement).value) })}
          />
        </td>
        <td>
          <Button className="Button Button--small" onclick={() => tier.save({ isEnabled: !enabled })}>
            {enabled ? app.translator.trans('ramon-point-system.admin.disable') : app.translator.trans('ramon-point-system.admin.enable')}
          </Button>
        </td>
        <td>
          <Button className="Button Button--danger Button--small" onclick={() => this.remove(tier)}>
            <i className="fas fa-trash" />
          </Button>
        </td>
      </tr>
    );
  }

  async create() {
    if (!this.draft.groupId) return;
    try {
      await app.store.createRecord('point-system-auto-group-tiers').save({
        groupId: this.draft.groupId,
        pointsRequired: this.draft.pointsRequired,
        isEnabled: true,
      });
      this.draft = { groupId: 0, pointsRequired: 100 };
      await this.load();
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Failed');
    }
  }

  async remove(tier: any) {
    if (!confirm(app.translator.trans('ramon-point-system.admin.confirm_delete') as string)) return;
    try {
      await tier.delete();
      this.items = this.items.filter((i) => i !== tier);
      m.redraw();
    } catch {
      app.alerts.show({ type: 'error' }, 'Failed');
    }
  }
}
