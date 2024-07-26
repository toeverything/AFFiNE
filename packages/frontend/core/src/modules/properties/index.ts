export {
  CompatibleFavoriteItemsAdapter,
  FavoriteItemsAdapter,
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
  FavoriteItemsAdapter,
  WorkspacePropertiesAdapter,
} from './services/adapter';
import { WorkspaceLegacyProperties } from './services/legacy-properties';

export function configureWorkspacePropertiesModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(WorkspaceLegacyProperties, [WorkspaceService])
    .service(WorkspacePropertiesAdapter, [WorkspaceService])
    .service(FavoriteItemsAdapter, [WorkspacePropertiesAdapter])
    .service(CompatibleFavoriteItemsAdapter, [
      FavoriteItemsAdapter,
      FavoriteService,
    ]);
}
