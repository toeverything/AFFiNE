export { WorkspacePermissionService } from './services/permission';

import { GraphQLService } from '@affine/core/modules/cloud';
import {
  type Framework,
  WorkspaceScope,
  WorkspaceService,
  WorkspacesService,
} from '@toeverything/infra';

import { WorkspacePermission } from './entities/permission';
import { WorkspacePermissionService } from './services/permission';
import { WorkspacePermissionStore } from './stores/permission';

export function configurePermissionsModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(WorkspacePermissionService, [
      WorkspaceService,
      WorkspacesService,
      WorkspacePermissionStore,
    ])
    .store(WorkspacePermissionStore, [GraphQLService])
    .entity(WorkspacePermission, [WorkspaceService, WorkspacePermissionStore]);
}
