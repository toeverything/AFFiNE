import type { WorkspaceServerService } from '@affine/core/modules/cloud';
import {
  type GrantDocUserRolesInput,
  grantDocUserRolesMutation,
  type PaginationInput,
  revokeDocUserRolesMutation,
  type UpdateDocDefaultRoleInput,
  updateDocDefaultRoleMutation,
  updateDocUserRoleMutation,
} from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { NbstoreService } from '../../storage';
import { mapDocGrantedUserSnapshot } from './realtime-mappers';

export class DocGrantedUsersStore extends Store {
  constructor(
    private readonly workspaceServerService: WorkspaceServerService,
    private readonly nbstoreService: NbstoreService
  ) {
    super();
  }

  async fetchDocGrantedUsersList(
    workspaceId: string,
    docId: string,
    pagination: PaginationInput,
    signal?: AbortSignal
  ) {
    return await this.nbstoreService.realtime
      .request(
        'doc.grants.get',
        {
          workspaceId,
          docId,
          pagination: {
            first: pagination.first ?? 10,
            offset: pagination.offset ?? 0,
            after: pagination.after ?? undefined,
          },
        },
        { signal, timeoutMs: 10000 }
      )
      .then(data => ({
        ...data,
        edges: data.edges.map(edge => ({
          node: mapDocGrantedUserSnapshot(edge.node),
        })),
      }));
  }

  subscribeDocGrants(workspaceId: string, docId: string) {
    return this.nbstoreService.realtime.subscribe('doc.grants.changed', {
      workspaceId,
      docId,
    });
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
    role: GrantDocUserRolesInput['role']
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
