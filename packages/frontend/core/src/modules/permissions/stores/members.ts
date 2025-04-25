import {
  approveWorkspaceTeamMemberMutation,
  createInviteLinkMutation,
  getMembersByWorkspaceIdQuery,
  grantWorkspaceTeamMemberMutation,
  inviteByEmailsMutation,
  type Permission,
  revokeInviteLinkMutation,
  revokeMemberPermissionMutation,
  type WorkspaceInviteLinkExpireTime,
} from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { WorkspaceServerService } from '../../cloud';

export class WorkspaceMembersStore extends Store {
  constructor(private readonly workspaceServerService: WorkspaceServerService) {
    super();
  }

  async fetchMembers(
    workspaceId: string,
    skip: number,
    take: number,
    signal?: AbortSignal
  ) {
    if (!this.workspaceServerService.server) {
      throw new Error('No Server');
    }
    const data = await this.workspaceServerService.server.gql({
      query: getMembersByWorkspaceIdQuery,
      variables: {
        workspaceId,
        skip,
        take,
      },
      context: {
        signal,
      },
    });

    return data.workspace;
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
