import { Service } from '@toeverything/infra';

import { WorkspacePermission } from '../entities/permission';

export class WorkspacePermissionService extends Service {
  permission = this.framework.createEntity(WorkspacePermission);
}
