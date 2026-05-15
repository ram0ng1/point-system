// @ts-nocheck
import app from 'flarum/admin/app';
import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';

export default class GroupOffersPanel extends Component {
  loading = true;
  items: any[] = [];

  draft = { groupId: 0, pointsRequired: 100, price: 100, isAuto: true, isPurchasable: false };

  oninit(vnode: any) {
    super.oninit(vnode);
    this.load();
  }

  async load() {
    this.loading = true;
    try {
      const res = await app.store.find('point-system-group-offers');
      this.items = Array.isArray(res) ? res.slice() : [];
    } finally {
      this.loading = false;
      m.redraw();
    }
  }

  view() {
    if (this.loading) return <LoadingIndicator />;

    const groups = app.store.all('groups').filter((g: any) => g.id() > 3);
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
            <label className="checkbox">
              <input
                type="checkbox"
                checked={this.draft.isAuto}
                onchange={(e: Event) => (this.draft.isAuto = (e.target as HTMLInputElement).checked)}
              />{' '}
              {app.translator.trans('ramon-point-system.admin.groups.field_is_auto')}
            </label>
            <p className="helpText">{app.translator.trans('ramon-point-system.admin.groups.field_is_auto_help')}</p>
          </div>
          {this.draft.isAuto && (
            <div className="Form-group">
              <label>{app.translator.trans('ramon-point-system.admin.groups.field_points_required')}</label>
              <input
                type="number"
                min="0"
                className="FormControl"
                value={this.draft.pointsRequired}
                oninput={(e: Event) => (this.draft.pointsRequired = Number((e.target as HTMLInputElement).value))}
              />
            </div>
          )}

          <div className="Form-group">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={this.draft.isPurchasable}
                onchange={(e: Event) => (this.draft.isPurchasable = (e.target as HTMLInputElement).checked)}
              />{' '}
              {app.translator.trans('ramon-point-system.admin.groups.field_is_purchasable')}
            </label>
            <p className="helpText">{app.translator.trans('ramon-point-system.admin.groups.field_is_purchasable_help')}</p>
          </div>
          {this.draft.isPurchasable && (
            <div className="Form-group">
              <label>{app.translator.trans('ramon-point-system.admin.groups.field_price')}</label>
              <input
                type="number"
                min="0"
                className="FormControl"
                value={this.draft.price}
                oninput={(e: Event) => (this.draft.price = Number((e.target as HTMLInputElement).value))}
              />
            </div>
          )}

          <Button
            className="Button Button--primary"
            disabled={!this.draft.groupId || (!this.draft.isAuto && !this.draft.isPurchasable)}
            onclick={() => this.create()}
          >
            {app.translator.trans('ramon-point-system.admin.groups.add')}
          </Button>
        </div>

        <h3>{app.translator.trans('ramon-point-system.admin.groups.existing')}</h3>
        {this.items.length === 0 && <p className="PointSystemAdmin-empty">{app.translator.trans('ramon-point-system.admin.groups.none')}</p>}
        <table className="PointSystemAdmin-table">
          <thead>
            <tr>
              <th>{app.translator.trans('ramon-point-system.admin.groups.col_group')}</th>
              <th>{app.translator.trans('ramon-point-system.admin.groups.col_mode')}</th>
              <th>{app.translator.trans('ramon-point-system.admin.groups.col_points')}</th>
              <th>{app.translator.trans('ramon-point-system.admin.groups.col_price')}</th>
              <th>{app.translator.trans('ramon-point-system.admin.groups.col_status')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {this.items
              .slice()
              .sort((a, b) => a.attribute('pointsRequired') - b.attribute('pointsRequired'))
              .map((o) => this.renderRow(o))}
          </tbody>
        </table>
      </div>
    );
  }

  renderRow(offer: any) {
    const group = app.store.getById('groups', offer.attribute('groupId'));
    const enabled = !!offer.attribute('isEnabled');
    const isAuto = !!offer.attribute('isAuto');
    const isPurchasable = !!offer.attribute('isPurchasable');
    return (
      <tr>
        <td>
          <span className="GroupBadge" style={{ backgroundColor: group?.color?.() || '#666' }}>
            <i className={`icon ${group?.icon?.() || 'fas fa-users'}`} />
            {group?.namePlural?.() || `#${offer.attribute('groupId')}`}
          </span>
        </td>
        <td>
          <label className="checkbox" title={app.translator.trans('ramon-point-system.admin.groups.field_is_auto') as string}>
            <input
              type="checkbox"
              checked={isAuto}
              onchange={(e: Event) => offer.save({ isAuto: (e.target as HTMLInputElement).checked })}
            />{' '}
            <i className="fas fa-bolt" />
          </label>{' '}
          <label className="checkbox" title={app.translator.trans('ramon-point-system.admin.groups.field_is_purchasable') as string}>
            <input
              type="checkbox"
              checked={isPurchasable}
              onchange={(e: Event) => offer.save({ isPurchasable: (e.target as HTMLInputElement).checked })}
            />{' '}
            <i className="fas fa-coins" />
          </label>
        </td>
        <td>
          <input
            type="number"
            className="FormControl"
            value={offer.attribute('pointsRequired')}
            disabled={!isAuto}
            min="0"
            onchange={(e: Event) => offer.save({ pointsRequired: Number((e.target as HTMLInputElement).value) })}
          />
        </td>
        <td>
          <input
            type="number"
            className="FormControl"
            value={offer.attribute('price')}
            disabled={!isPurchasable}
            min="0"
            onchange={(e: Event) => offer.save({ price: Number((e.target as HTMLInputElement).value) })}
          />
        </td>
        <td>
          <Button className="Button Button--small" onclick={() => offer.save({ isEnabled: !enabled })}>
            {enabled ? app.translator.trans('ramon-point-system.admin.disable') : app.translator.trans('ramon-point-system.admin.enable')}
          </Button>
        </td>
        <td>
          <Button className="Button Button--danger Button--small" onclick={() => this.remove(offer)}>
            <i className="fas fa-trash" />
          </Button>
        </td>
      </tr>
    );
  }

  async create() {
    if (!this.draft.groupId) return;
    if (!this.draft.isAuto && !this.draft.isPurchasable) return;
    try {
      await app.store.createRecord('point-system-group-offers').save({
        groupId: this.draft.groupId,
        pointsRequired: this.draft.isAuto ? this.draft.pointsRequired : 0,
        price: this.draft.isPurchasable ? this.draft.price : 0,
        isAuto: this.draft.isAuto,
        isPurchasable: this.draft.isPurchasable,
        isEnabled: true,
      });
      this.draft = { groupId: 0, pointsRequired: 100, price: 100, isAuto: true, isPurchasable: false };
      await this.load();
    } catch (e: any) {
      app.alerts.show({ type: 'error' }, e?.response?.errors?.[0]?.detail || 'Failed');
    }
  }

  async remove(offer: any) {
    if (!confirm(app.translator.trans('ramon-point-system.admin.confirm_delete') as string)) return;
    try {
      await offer.delete();
      this.items = this.items.filter((i) => i !== offer);
      m.redraw();
    } catch {
      app.alerts.show({ type: 'error' }, 'Failed');
    }
  }
}
