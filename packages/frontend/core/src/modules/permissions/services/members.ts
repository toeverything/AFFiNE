import { Service } from '@toeverything/infra';

import { WorkspaceMembers } from '../entities/members';

export class WorkspaceMembersService extends Service {
  members = this.framework.createEntity(WorkspaceMembers);
}
