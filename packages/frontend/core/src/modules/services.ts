import {
  GlobalCache,
  type ServiceCollection,
  Workspace,
  WorkspaceScope,
} from '@toeverything/infra';

import { CollectionService } from './collection';
import { LocalStorageGlobalCache } from './infra-web/storage';
import { CurrentPageService } from './page';
import {
  CurrentWorkspaceService,
  WorkspacePropertiesAdapter,
} from './workspace';

export function configureBusinessServices(services: ServiceCollection) {
  services.add(CurrentWorkspaceService);
  services
    .scope(WorkspaceScope)
    .add(CurrentPageService)
    .add(WorkspacePropertiesAdapter, [Workspace])
    .add(CollectionService, [Workspace]);
}

export function configureWebInfraServices(services: ServiceCollection) {
  services.addImpl(GlobalCache, LocalStorageGlobalCache);
}
