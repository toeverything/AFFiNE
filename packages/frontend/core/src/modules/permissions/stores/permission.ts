import type { WorkspaceServerService } from '@affine/core/modules/cloud';
import { leaveWorkspaceMutation } from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { NbstoreService } from '../../storage';
import type { WorkspaceLocalState } from '../../workspace';

export class WorkspacePermissionStore extends Store {
  constructor(
    private readonly workspaceServerService: WorkspaceServerService,
    private readonly workspaceLocalState: WorkspaceLocalState,
    private readonly nbstoreService: NbstoreService
  ) {
    super();
  }

  async fetchWorkspaceInfo(workspaceId: string, signal?: AbortSignal) {
    const { access } = await this.nbstoreService.realtime.request(
      'workspace.access.get',
      { workspaceId },
      { signal, timeoutMs: 10000 }
    );
    return { workspace: access };
  }

  subscribeWorkspaceAccess(workspaceId: string) {
    return this.nbstoreService.realtime.subscribe('workspace.access.changed', {
      workspaceId,
    });
  }

  /**
   * @param workspaceName for send email
   */
  async leaveWorkspace(workspaceId: string) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    await this.workspaceServerService.server.gql({
      query: leaveWorkspaceMutation,
      variables: {
        workspaceId,
      },
    });
  }

  watchWorkspacePermissionCache() {
    return this.workspaceLocalState.watch<{
      isOwner: boolean;
      isAdmin: boolean;
      isTeam: boolean;
    }>('permission');
  }

  setWorkspacePermissionCache(permission: {
    isOwner: boolean;
    isAdmin: boolean;
    isTeam: boolean;
  }) {
    this.workspaceLocalState.set('permission', permission);
  }
}
