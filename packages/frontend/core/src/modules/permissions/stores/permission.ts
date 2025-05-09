import type { WorkspaceServerService } from '@affine/core/modules/cloud';
import { getWorkspaceInfoQuery, leaveWorkspaceMutation } from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { WorkspaceLocalState } from '../../workspace';

export class WorkspacePermissionStore extends Store {
  constructor(
    private readonly workspaceServerService: WorkspaceServerService,
    private readonly workspaceLocalState: WorkspaceLocalState
  ) {
    super();
  }

  async fetchWorkspaceInfo(workspaceId: string, signal?: AbortSignal) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    const info = await this.workspaceServerService.server.gql({
      query: getWorkspaceInfoQuery,
      variables: {
        workspaceId,
      },
      context: { signal },
    });

    return info;
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
