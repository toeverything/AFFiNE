import { Injectable } from '@nestjs/common';

import { OnEvent } from '../../base';
import { Models } from '../../models';
import { WorkspaceService } from './resolvers/service';

@Injectable()
export class WorkspaceEvents {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly models: Models
  ) {}

  @OnEvent('workspace.members.reviewRequested')
  async onReviewRequested({
    inviteId,
  }: Events['workspace.members.reviewRequested']) {
    // send review request mail to owner and admin
    await this.workspaceService.sendReviewRequestedEmail(inviteId);
  }

  @OnEvent('workspace.members.requestApproved')
  async onApproveRequest({
    inviteId,
  }: Events['workspace.members.requestApproved']) {
    // send approve mail
    await this.workspaceService.sendReviewApproveEmail(inviteId);
  }

  @OnEvent('workspace.members.requestDeclined')
  async onDeclineRequest({
    userId,
    workspaceId,
  }: Events['workspace.members.requestDeclined']) {
    const user = await this.models.user.getWorkspaceUser(userId);
    if (!user) {
      return;
    }
    // send decline mail
    await this.workspaceService.sendReviewDeclinedEmail(
      user.email,
      workspaceId
    );
  }

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
}
