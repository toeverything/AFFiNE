import {
  WorkspaceMemberStatus,
  WorkspaceRole,
  type WorkspaceUserCompat,
} from '../../models';
import { workspaceInvitationToCompat } from '../../models/workspace-user-compat';
import { Mocker } from './factory';

export type MockWorkspaceUserInput = {
  workspaceId: string;
  userId: string;
  type?: WorkspaceRole;
  status?: WorkspaceMemberStatus;
  inviterId?: string | null;
  kind?: 'email' | 'link';
};

export class MockWorkspaceUser extends Mocker<
  MockWorkspaceUserInput,
  WorkspaceUserCompat
> {
  override async create(input: MockWorkspaceUserInput) {
    const type = input.type ?? WorkspaceRole.Collaborator;
    const status = input.status ?? WorkspaceMemberStatus.Accepted;
    if (status === WorkspaceMemberStatus.Accepted) {
      const member = await this.db.workspaceMember.create({
        data: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          role:
            type === WorkspaceRole.Owner
              ? 'owner'
              : type === WorkspaceRole.Admin
                ? 'admin'
                : 'member',
          state: 'active',
          source: 'legacy',
        },
      });
      return {
        ...member,
        type,
        status,
        source: 'Email' as const,
        inviterId: null,
      };
    }

    const invitation = await this.db.workspaceInvitation.create({
      data: {
        workspaceId: input.workspaceId,
        inviteeUserId: input.userId,
        inviterUserId: input.inviterId,
        requestedRole: type === WorkspaceRole.Admin ? 'admin' : 'member',
        status:
          status === WorkspaceMemberStatus.UnderReview
            ? 'waiting_review'
            : status === WorkspaceMemberStatus.NeedMoreSeat ||
                status === WorkspaceMemberStatus.AllocatingSeat ||
                status === WorkspaceMemberStatus.NeedMoreSeatAndReview
              ? 'waiting_seat'
              : 'pending',
        kind: input.kind ?? 'email',
      },
    });
    return workspaceInvitationToCompat(invitation);
  }
}
