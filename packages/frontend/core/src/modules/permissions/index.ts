export { WorkspacePermissionService } from './services/permission';

import { GraphQLService } from '@affine/core/modules/cloud';
import {
  type Framework,
  WorkspaceScope,
  WorkspaceService,
} from '@toeverything/infra';

import { WorkspacePermission } from './entities/permission';
import { WorkspacePermissionService } from './services/permission';
import { WorkspacePermissionStore } from './stores/permission';

export function configurePermissionsModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(WorkspacePermissionService)
    .store(WorkspacePermissionStore, [GraphQLService])
    .entity(WorkspacePermission, [WorkspaceService, WorkspacePermissionStore]);
}
