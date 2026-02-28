export type { Member } from './entities/members';
export {
  DocGrantedUsersService,
  type GrantedUser,
} from './services/doc-granted-users';
export { GuardService } from './services/guard';
export { MemberSearchService } from './services/member-search';
export { WorkspaceMembersService } from './services/members';
export { WorkspacePermissionService } from './services/permission';
export {
  type DocPermissionActions,
  type WorkspacePermissionActions,
} from './stores/guard';

import { type Framework } from '@toeverything/infra';

import { WorkspaceServerService } from '../cloud';
import { DocScope, DocService } from '../doc';
import {
  WorkspaceLocalState,
  WorkspaceScope,
  WorkspaceService,
  WorkspacesService,
} from '../workspace';
import { WorkspaceMembers } from './entities/members';
import { WorkspacePermission } from './entities/permission';
import { DocGrantedUsersService } from './services/doc-granted-users';
import { GuardService } from './services/guard';
import { MemberSearchService } from './services/member-search';
import { WorkspaceMembersService } from './services/members';
import { WorkspacePermissionService } from './services/permission';
import { DocGrantedUsersStore } from './stores/doc-granted-users';
import { GuardStore } from './stores/guard';
import { MemberSearchStore } from './stores/member-search';
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
    .store(WorkspacePermissionStore, [
      WorkspaceServerService,
      WorkspaceLocalState,
    ])
    .entity(WorkspacePermission, [WorkspaceService, WorkspacePermissionStore])
    .service(WorkspaceMembersService, [WorkspaceMembersStore, WorkspaceService])
    .store(WorkspaceMembersStore, [WorkspaceServerService])
    .entity(WorkspaceMembers, [WorkspaceMembersStore, WorkspaceService])
    .service(MemberSearchService, [MemberSearchStore, WorkspaceService])
    .store(MemberSearchStore, [WorkspaceServerService])
    .service(GuardService, [
      GuardStore,
      WorkspaceService,
      WorkspacePermissionService,
    ])
    .store(GuardStore, [WorkspaceService, WorkspaceServerService]);

  framework
    .scope(WorkspaceScope)
    .scope(DocScope)
    .service(DocGrantedUsersService, [
      DocGrantedUsersStore,
      WorkspaceService,
      DocService,
    ])
    .store(DocGrantedUsersStore, [WorkspaceServerService]);
}
