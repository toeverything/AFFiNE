export {
  CompatibleFavoriteItemsAdapter,
  MigrationFavoriteItemsAdapter,
  WorkspacePropertiesAdapter,
} from './services/adapter';
export { WorkspaceLegacyProperties } from './services/legacy-properties';

import {
  type Framework,
  WorkspaceScope,
  WorkspaceService,
} from '@toeverything/infra';

import { FavoriteService } from '../favorite';
import {
  CompatibleFavoriteItemsAdapter,
  MigrationFavoriteItemsAdapter,
  WorkspacePropertiesAdapter,
} from './services/adapter';
import { WorkspaceLegacyProperties } from './services/legacy-properties';

export function configureWorkspacePropertiesModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(WorkspaceLegacyProperties, [WorkspaceService])
    .service(WorkspacePropertiesAdapter, [WorkspaceService])
    .service(MigrationFavoriteItemsAdapter, [WorkspacePropertiesAdapter])
    .service(CompatibleFavoriteItemsAdapter, [FavoriteService]);
}
