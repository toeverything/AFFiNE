import type { WorkspaceService, WorkspacesService } from '@toeverything/infra';
import { Service } from '@toeverything/infra';

import { WorkspacePermission } from '../entities/permission';
import type { WorkspacePermissionStore } from '../stores/permission';

export class WorkspacePermissionService extends Service {
  permission = this.framework.createEntity(WorkspacePermission);

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly workspacesService: WorkspacesService,
    private readonly store: WorkspacePermissionStore
  ) {
    super();
  }

  async leaveWorkspace() {
    await this.store.leaveWorkspace(
      this.workspaceService.workspace.id,
      this.workspaceService.workspace.name$.value ?? ''
    );
    this.workspacesService.list.revalidate();
  }
}
