import {
  approveWorkspaceTeamMemberMutation,
  createInviteLinkMutation,
  grantWorkspaceTeamMemberMutation,
  inviteByEmailsMutation,
  type Permission,
  revokeInviteLinkMutation,
  revokeMemberPermissionMutation,
  type WorkspaceInviteLinkExpireTime,
} from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { WorkspaceServerService } from '../../cloud';
import type { NbstoreService } from '../../storage';
import { mapWorkspaceMemberSnapshot } from './realtime-mappers';

export class WorkspaceMembersStore extends Store {
  constructor(
    private readonly workspaceServerService: WorkspaceServerService,
    private readonly nbstoreService: NbstoreService
  ) {
    super();
  }

  async fetchMembers(
    workspaceId: string,
    skip: number,
    take: number,
    signal?: AbortSignal
  ) {
    return await this.nbstoreService.realtime
      .request(
        'workspace.members.get',
        { workspaceId, skip, take },
        { signal, timeoutMs: 10000 }
      )
      .then(data => ({
        ...data,
        members: data.members.map(mapWorkspaceMemberSnapshot),
      }));
  }

  subscribeMembers(workspaceId: string) {
    return this.nbstoreService.realtime.subscribe('workspace.members.changed', {
      workspaceId,
    });
  }

  async inviteBatch(workspaceId: string, emails: string[]) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    const inviteBatch = await this.workspaceServerService.server.gql({
      query: inviteByEmailsMutation,
      variables: {
        workspaceId,
        emails,
      },
    });
    return inviteBatch.inviteMembers;
  }

  async generateInviteLink(
    workspaceId: string,
    expireTime: WorkspaceInviteLinkExpireTime
  ) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    const inviteLink = await this.workspaceServerService.server.gql({
      query: createInviteLinkMutation,
      variables: {
        workspaceId,
        expireTime,
      },
    });
    return inviteLink.createInviteLink;
  }

  async revokeInviteLink(workspaceId: string, signal?: AbortSignal) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    const revoke = await this.workspaceServerService.server.gql({
      query: revokeInviteLinkMutation,
      variables: {
        workspaceId,
      },
      context: { signal },
    });
    return revoke.revokeInviteLink;
  }

  async revokeMemberPermission(
    workspaceId: string,
    userId: string,
    signal?: AbortSignal
  ) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    const revoke = await this.workspaceServerService.server.gql({
      query: revokeMemberPermissionMutation,
      variables: {
        workspaceId,
        userId,
      },
      context: { signal },
    });
    return revoke.revokeMember;
  }

  async approveMember(workspaceId: string, userId: string) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    const member = await this.workspaceServerService.server.gql({
      query: approveWorkspaceTeamMemberMutation,
      variables: {
        workspaceId,
        userId,
      },
    });
    return member.approveMember;
  }

  async adjustMemberPermission(
    workspaceId: string,
    userId: string,
    permission: Permission
  ) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    const member = await this.workspaceServerService.server.gql({
      query: grantWorkspaceTeamMemberMutation,
      variables: {
        workspaceId,
        userId,
        permission,
      },
    });
    return member.grantMember;
  }
}
