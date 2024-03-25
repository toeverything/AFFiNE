import type { ServiceCollection } from '@toeverything/infra';
import {
  GlobalCache,
  GlobalState,
  PageRecordList,
  Workspace,
  WorkspaceScope,
} from '@toeverything/infra';

import { CollectionService } from './collection';
import {
  LocalStorageGlobalCache,
  LocalStorageGlobalState,
} from './infra-web/storage';
import { Navigator } from './navigation';
import { RightSidebar } from './right-sidebar/entities/right-sidebar';
import { TagService } from './tag';
import { Workbench } from './workbench';
import {
  CurrentWorkspaceService,
  WorkspaceLegacyProperties,
  WorkspacePropertiesAdapter,
} from './workspace';

export function configureBusinessServices(services: ServiceCollection) {
  services.add(CurrentWorkspaceService);
  services
    .scope(WorkspaceScope)
    .add(Workbench)
    .add(Navigator, [Workbench])
    .add(RightSidebar, [GlobalState])
    .add(WorkspacePropertiesAdapter, [Workspace])
    .add(CollectionService, [Workspace])
    .add(WorkspaceLegacyProperties, [Workspace])
    .add(TagService, [WorkspaceLegacyProperties, PageRecordList]);
}

export function configureWebInfraServices(services: ServiceCollection) {
  services
    .addImpl(GlobalCache, LocalStorageGlobalCache)
    .addImpl(GlobalState, LocalStorageGlobalState);
}
