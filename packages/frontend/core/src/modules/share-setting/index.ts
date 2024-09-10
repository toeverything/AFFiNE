export { WorkspaceShareSettingService } from './services/share-setting';

import { GraphQLService } from '@affine/core/modules/cloud';
import {
  type Framework,
  WorkspaceScope,
  WorkspaceService,
} from '@toeverything/infra';

import { WorkspaceShareSetting } from './entities/share-setting';
import { WorkspaceShareSettingService } from './services/share-setting';
import { WorkspaceShareSettingStore } from './stores/share-setting';

export function configureShareSettingModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(WorkspaceShareSettingService)
    .store(WorkspaceShareSettingStore, [GraphQLService])
    .entity(WorkspaceShareSetting, [
      WorkspaceService,
      WorkspaceShareSettingStore,
    ]);
}
