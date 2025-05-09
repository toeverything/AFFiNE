import type { WorkspaceServerService } from '@affine/core/modules/cloud';
import {
  type DocRole,
  getPageGrantedUsersListQuery,
  type GrantDocUserRolesInput,
  grantDocUserRolesMutation,
  type PaginationInput,
  revokeDocUserRolesMutation,
  type UpdateDocDefaultRoleInput,
  updateDocDefaultRoleMutation,
  updateDocUserRoleMutation,
} from '@affine/graphql';
import { Store } from '@toeverything/infra';

export class DocGrantedUsersStore extends Store {
  constructor(private readonly workspaceServerService: WorkspaceServerService) {
    super();
  }

  async fetchDocGrantedUsersList(
    workspaceId: string,
    docId: string,
    pagination: PaginationInput,
    signal?: AbortSignal
  ) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    const res = await this.workspaceServerService.server.gql({
      query: getPageGrantedUsersListQuery,
      variables: {
        workspaceId,
        docId,
        pagination,
      },
      context: { signal },
    });

    return res.workspace.doc.grantedUsersList;
  }

  async grantDocUserRoles(input: GrantDocUserRolesInput) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    const res = await this.workspaceServerService.server.gql({
      query: grantDocUserRolesMutation,
      variables: {
        input,
      },
    });

    return res.grantDocUserRoles;
  }

  async revokeDocUserRoles(workspaceId: string, docId: string, userId: string) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    const res = await this.workspaceServerService.server.gql({
      query: revokeDocUserRolesMutation,
      variables: {
        input: {
          workspaceId,
          docId,
          userId,
        },
      },
    });

    return res.revokeDocUserRoles;
  }

  async updateDocUserRole(
    workspaceId: string,
    docId: string,
    userId: string,
    role: DocRole
  ) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    const res = await this.workspaceServerService.server.gql({
      query: updateDocUserRoleMutation,
      variables: {
        input: {
          workspaceId,
          docId,
          userId,
          role,
        },
      },
    });

    return res.updateDocUserRole;
  }

  async updateDocDefaultRole(input: UpdateDocDefaultRoleInput) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    const res = await this.workspaceServerService.server.gql({
      query: updateDocDefaultRoleMutation,
      variables: {
        input,
      },
    });

    return res.updateDocDefaultRole;
  }
}
