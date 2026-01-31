import {
  type GetDocRolePermissionsQuery,
  getDocRolePermissionsQuery,
  type GetWorkspaceInfoQuery,
  getWorkspaceInfoQuery,
} from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { WorkspaceServerService } from '../../cloud';
import type { WorkspaceService } from '../../workspace';

export type WorkspacePermissionActions = keyof Omit<
  GetWorkspaceInfoQuery['workspace']['permissions'],
  '__typename'
>;

export type DocPermissionActions = keyof Omit<
  GetDocRolePermissionsQuery['workspace']['doc']['permissions'],
  '__typename'
>;

export class GuardStore extends Store {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly workspaceServerService: WorkspaceServerService
  ) {
    super();
  }

  async getWorkspacePermissions(): Promise<
    Record<WorkspacePermissionActions, boolean>
  > {
    if (!this.workspaceServerService.server) {
      throw new Error('No server');
    }
    const data = await this.workspaceServerService.server.gql({
      query: getWorkspaceInfoQuery,
      variables: {
        workspaceId: this.workspaceService.workspace.id,
      },
    });
    return data.workspace.permissions;
  }

  async getDocPermissions(
    docId: string
  ): Promise<Record<DocPermissionActions, boolean>> {
    if (!this.workspaceServerService.server) {
      throw new Error('No server');
    }
    const data = await this.workspaceServerService.server.gql({
      query: getDocRolePermissionsQuery,
      variables: {
        workspaceId: this.workspaceService.workspace.id,
        docId,
      },
    });
    return data.workspace.doc.permissions;
  }
}
