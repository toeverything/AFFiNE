import type {
  Permission,
  WorkspaceInviteLinkExpireTime,
} from '@affine/graphql';
import { Service } from '@toeverything/infra';

import type { WorkspaceService } from '../../workspace';
import { WorkspaceMembers } from '../entities/members';
import type { WorkspaceMembersStore } from '../stores/members';

export class WorkspaceMembersService extends Service {
  constructor(
    private readonly store: WorkspaceMembersStore,
    private readonly workspaceService: WorkspaceService
  ) {
    super();
  }

  members = this.framework.createEntity(WorkspaceMembers);

  async inviteMembers(emails: string[]) {
    return await this.store.inviteBatch(
      this.workspaceService.workspace.id,
      emails
    );
  }

  async generateInviteLink(expireTime: WorkspaceInviteLinkExpireTime) {
    return await this.store.generateInviteLink(
      this.workspaceService.workspace.id,
      expireTime
    );
  }

  async revokeInviteLink() {
    return await this.store.revokeInviteLink(
      this.workspaceService.workspace.id
    );
  }

  async revokeMember(userId: string) {
    return await this.store.revokeMemberPermission(
      this.workspaceService.workspace.id,
      userId
    );
  }

  async approveMember(userId: string) {
    return await this.store.approveMember(
      this.workspaceService.workspace.id,
      userId
    );
  }

  async adjustMemberPermission(userId: string, permission: Permission) {
    return await this.store.adjustMemberPermission(
      this.workspaceService.workspace.id,
      userId,
      permission
    );
  }
}
