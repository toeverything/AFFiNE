import { Injectable, Logger } from '@nestjs/common';

import { OnEvent } from '../../base';
import { Models } from '../../models';
import { Mailer } from '../mail';
import { WorkspaceService } from './service';

declare global {
  interface Events {
    'workspace.members.invite': {
      inviterId: string;
      inviteId: string;
    };
    'workspace.members.removed': {
      workspaceId: string;
      userId: string;
    };
    'workspace.members.leave': {
      workspaceId: string;
      userId: string;
    };
    'workspace.members.updated': {
      workspaceId: string;
    };
    'workspace.members.allocateSeats': {
      workspaceId: string;
      quantity: number;
    };
  }
}

@Injectable()
export class WorkspaceEvents {
  private readonly logger = new Logger(WorkspaceEvents.name);

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly models: Models,
    private readonly mailer: Mailer
  ) {}

  @OnEvent('workspace.members.roleChanged')
  async onRoleChanged({
    userId,
    workspaceId,
    role,
  }: Events['workspace.members.roleChanged']) {
    // send role changed mail
    await this.workspaceService.sendRoleChangedEmail(userId, {
      id: workspaceId,
      role,
    });
  }

  @OnEvent('workspace.members.removed')
  async onMemberRemoved({
    userId,
    workspaceId,
  }: Events['workspace.members.removed']) {
    const user = await this.models.user.get(userId);
    if (!user) {
      this.logger.warn(
        `User not found for seeding member removed email: ${userId}`
      );
      return;
    }

    await this.mailer.trySend({
      name: 'MemberRemoved',
      to: user.email,
      props: {
        workspace: {
          $$workspaceId: workspaceId,
        },
      },
    });
  }

  @OnEvent('workspace.owner.changed')
  async onOwnerTransferred({
    workspaceId,
    from,
    to,
  }: Events['workspace.owner.changed']) {
    // send ownership transferred mail
    const fromUser = await this.models.user.getWorkspaceUser(from);
    const toUser = await this.models.user.getWorkspaceUser(to);

    if (fromUser) {
      await this.workspaceService.sendOwnershipTransferredEmail(
        fromUser.email,
        {
          id: workspaceId,
        }
      );
    }

    if (toUser) {
      await this.workspaceService.sendOwnershipReceivedEmail(toUser.email, {
        id: workspaceId,
      });
    }
  }

  @OnEvent('workspace.members.leave')
  async onMemberLeave({
    userId,
    workspaceId,
  }: Events['workspace.members.leave']) {
    await this.workspaceService.sendLeaveEmail(workspaceId, userId);
  }

  @OnEvent('workspace.members.invite')
  async onMemberInvite({
    inviterId,
    inviteId,
  }: Events['workspace.members.invite']) {
    await this.workspaceService.sendInvitationNotification(inviterId, inviteId);
  }

  @OnEvent('workspace.members.allocateSeats')
  async onAllocateSeats({
    workspaceId,
    quantity,
  }: Events['workspace.members.allocateSeats']) {
    await this.workspaceService.allocateSeats(workspaceId, quantity);
  }
}
