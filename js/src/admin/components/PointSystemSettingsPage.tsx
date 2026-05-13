// @ts-nocheck
import ExtensionPage from 'flarum/admin/components/ExtensionPage';
import AdminNav from './AdminNav';
import PointsRulesPanel from './PointsRulesPanel';
import UsersPointsPanel from './UsersPointsPanel';
import AvatarDecorationsPanel from './AvatarDecorationsPanel';
import NameDecorationsPanel from './NameDecorationsPanel';
import AutoGroupTiersPanel from './AutoGroupTiersPanel';
import ManualAwardPanel from './ManualAwardPanel';

export default class PointSystemSettingsPage extends ExtensionPage {
  content() {
    const tab = (m.route.param('tab') as string) || 'rules';

    let child;
    switch (tab) {
      case 'users':
        child = <UsersPointsPanel />;
        break;
      case 'avatar':
        child = <AvatarDecorationsPanel />;
        break;
      case 'name':
        child = <NameDecorationsPanel />;
        break;
      case 'groups':
        child = <AutoGroupTiersPanel />;
        break;
      case 'manual':
        child = <ManualAwardPanel />;
        break;
      default:
        child = <PointsRulesPanel page={this} />;
    }

    return (
      <div className="ExtensionPage-settings PointSystemAdmin">
        {AdminNav(tab)}
        <div className="container PointSystemAdmin-body">{child}</div>
      </div>
    );
  }
}
