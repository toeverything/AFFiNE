import { RefreshFeatures0001 } from './0001-refresh-features';
import { Guid1698398506533 } from './1698398506533-guid';
import { UnamedAccount1703756315970 } from './1703756315970-unamed-account';
import { RefreshUnnamedUser1721299086340 } from './1721299086340-refresh-unnamed-user';
import { MigrateInviteStatus1732861452428 } from './1732861452428-migrate-invite-status';
import { UniversalSubscription1733125339942 } from './1733125339942-universal-subscription';
import { FeatureRedundant1738590347632 } from './1738590347632-feature-redundant';

// Explicit ordered export ensures migrations run in correct chronological order by filename
export const migrations = [
  RefreshFeatures0001,
  Guid1698398506533,
  UnamedAccount1703756315970,
  RefreshUnnamedUser1721299086340,
  MigrateInviteStatus1732861452428,
  UniversalSubscription1733125339942,
  FeatureRedundant1738590347632,
];
