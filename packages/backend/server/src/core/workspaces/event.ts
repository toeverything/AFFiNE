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
