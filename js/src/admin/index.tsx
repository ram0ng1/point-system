// @ts-nocheck
import app from 'flarum/admin/app';
import PointSystemSettingsPage from './components/PointSystemSettingsPage';
import AvatarDecoration from './models/AvatarDecoration';
import NameDecoration from './models/NameDecoration';
import CoverDecoration from './models/CoverDecoration';
import TitleDecoration from './models/TitleDecoration';
import PostHighlightDecoration from './models/PostHighlightDecoration';
import AutoGroupTier from './models/AutoGroupTier';

app.initializers.add('ramon/point-system', () => {
  // Register custom JSON:API resource types with the store so app.store.find()
  // can deserialize responses. Type keys MUST match each resource's PHP type().
  app.store.models['point-system-avatar-decorations'] = AvatarDecoration;
  app.store.models['point-system-name-decorations'] = NameDecoration;
  app.store.models['point-system-cover-decorations'] = CoverDecoration;
  app.store.models['point-system-title-decorations'] = TitleDecoration;
  app.store.models['point-system-post-highlight-decorations'] = PostHighlightDecoration;
  app.store.models['point-system-auto-group-tiers'] = AutoGroupTier;

  app.registry
    .for('ramon-point-system')
    .registerPage(PointSystemSettingsPage)
    .registerPermission(
      {
        icon: 'fas fa-coins',
        label: app.translator.trans('ramon-point-system.admin.permissions.view_shop'),
        permission: 'pointSystem.viewShop',
      },
      'view'
    )
    .registerPermission(
      {
        icon: 'fas fa-eye',
        label: app.translator.trans('ramon-point-system.admin.permissions.view_others'),
        permission: 'pointSystem.viewOthers',
        // Allow granting this to the Guest group too — Flarum's PermissionGrid
        // hides the "Everyone" option by default; `allowGuest: true` flips it on.
        allowGuest: true,
      },
      'view'
    )
    .registerPermission(
      {
        icon: 'fas fa-shopping-cart',
        label: app.translator.trans('ramon-point-system.admin.permissions.claim'),
        permission: 'pointSystem.claim',
      },
      'reply'
    )
    .registerPermission(
      {
        icon: 'fas fa-cog',
        label: app.translator.trans('ramon-point-system.admin.permissions.manage'),
        permission: 'pointSystem.manage',
      },
      'moderate'
    );
});
