export type { Member } from './entities/members';
export { WorkspaceMembersService } from './services/members';
export { WorkspacePermissionService } from './services/permission';

import { GraphQLService } from '@affine/core/modules/cloud';
import {
  type Framework,
  WorkspaceScope,
  WorkspaceService,
  WorkspacesService,
} from '@toeverything/infra';

import { WorkspaceMembers } from './entities/members';
import { WorkspacePermission } from './entities/permission';
import { WorkspaceMembersService } from './services/members';
import { WorkspacePermissionService } from './services/permission';
import { WorkspaceMembersStore } from './stores/members';
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
    .entity(WorkspacePermission, [WorkspaceService, WorkspacePermissionStore])
    .service(WorkspaceMembersService)
    .store(WorkspaceMembersStore, [GraphQLService])
    .entity(WorkspaceMembers, [WorkspaceMembersStore, WorkspaceService]);
}
