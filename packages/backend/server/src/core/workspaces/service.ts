import { Injectable, Logger } from '@nestjs/common';
import { getStreamAsBuffer } from 'get-stream';

import { Cache, JobQueue, NotFound, URLHelper } from '../../base';
import {
  DEFAULT_WORKSPACE_AVATAR,
  DEFAULT_WORKSPACE_NAME,
  Models,
} from '../../models';
import { DocReader } from '../doc';
import { Mailer } from '../mail';
import { WorkspaceRole } from '../permission';
import { WorkspaceBlobStorage } from '../storage';

export type InviteInfo = {
  isLink: boolean;
  workspaceId: string;
  inviterUserId: string | null;
  inviteeUserId: string | null;
};

@Injectable()
export class WorkspaceService {
  private readonly logger = new Logger(WorkspaceService.name);

  constructor(
    private readonly cache: Cache,
    private readonly models: Models,
    private readonly url: URLHelper,
    private readonly doc: DocReader,
    private readonly blobStorage: WorkspaceBlobStorage,
    private readonly mailer: Mailer,
    private readonly queue: JobQueue
  ) {}

  async getInviteInfo(inviteId: string): Promise<InviteInfo> {
    // invite link
    const invite = await this.cache.get<InviteInfo>(
      `workspace:inviteLinkId:${inviteId}`
    );
    if (typeof invite?.workspaceId === 'string') {
      return {
        ...invite,
        isLink: true,
      };
    }

    const workspaceUser = await this.models.workspaceUser.getById(inviteId);

    if (!workspaceUser) {
      throw new NotFound('Invitation not found');
    }

    return {
      isLink: false,
      workspaceId: workspaceUser.workspaceId,
      inviteeUserId: workspaceUser.userId,
      inviterUserId: workspaceUser.inviterId,
    };
  }

  async getWorkspaceInfo(workspaceId: string) {
    const workspaceContent = await this.doc.getWorkspaceContent(workspaceId);

    let avatar = DEFAULT_WORKSPACE_AVATAR;
    if (workspaceContent?.avatarKey) {
      const avatarBlob = await this.blobStorage.get(
        workspaceId,
        workspaceContent.avatarKey
      );

      if (avatarBlob.body) {
        avatar = (await getStreamAsBuffer(avatarBlob.body)).toString('base64');
      }
    }

    return {
      avatar,
      id: workspaceId,
      name: workspaceContent?.name ?? DEFAULT_WORKSPACE_NAME,
    };
  }

  async sendInvitationAcceptedNotification(
    inviterId: string,
    inviteId: string
  ) {
    await this.queue.add('notification.sendInvitationAccepted', {
      inviterId,
      inviteId,
    });
  }
  async sendInvitationNotification(inviterId: string, inviteId: string) {
    await this.queue.add('notification.sendInvitation', {
      inviterId,
      inviteId,
    });
  }

  // ================ Team ================
  async isTeamWorkspace(workspaceId: string) {
    return this.models.workspace.isTeamWorkspace(workspaceId);
  }

  async sendTeamWorkspaceUpgradedEmail(workspaceId: string) {
    const owner = await this.models.workspaceUser.getOwner(workspaceId);
    const admins = await this.models.workspaceUser.getAdmins(workspaceId);

    const link = this.url.link(`/workspace/${workspaceId}`);
    await this.mailer.trySend({
      name: 'TeamWorkspaceUpgraded',
      to: owner.email,
      props: {
        workspace: {
          $$workspaceId: workspaceId,
        },
        isOwner: true,
        url: link,
      },
    });

    await Promise.allSettled(
      admins.map(async user => {
        await this.mailer.trySend({
          name: 'TeamWorkspaceUpgraded',
          to: user.email,
          props: {
            workspace: {
              $$workspaceId: workspaceId,
            },
            isOwner: false,
            url: link,
          },
        });
      })
    );
  }

  async sendReviewRequestNotification(inviteId: string) {
    const { workspaceId, inviteeUserId } = await this.getInviteInfo(inviteId);
    if (!inviteeUserId) {
      this.logger.error(`Invitee user not found for inviteId: ${inviteId}`);
      return;
    }

    const owner = await this.models.workspaceUser.getOwner(workspaceId);
    const admins = await this.models.workspaceUser.getAdmins(workspaceId);

    await Promise.allSettled(
      [owner, ...admins].map(async reviewer => {
        await this.queue.add('notification.sendInvitationReviewRequest', {
          reviewerId: reviewer.id,
          inviteId,
        });
      })
    );
  }

  async sendReviewApprovedNotification(inviteId: string, reviewerId: string) {
    await this.queue.add('notification.sendInvitationReviewApproved', {
      reviewerId,
      inviteId,
    });
  }

  async sendReviewDeclinedNotification(
    userId: string,
    workspaceId: string,
    reviewerId: string
  ) {
    await this.queue.add('notification.sendInvitationReviewDeclined', {
      reviewerId,
      userId,
      workspaceId,
    });
  }

  async sendRoleChangedEmail(
    userId: string,
    ws: { id: string; role: WorkspaceRole }
  ) {
    const user = await this.models.user.getWorkspaceUser(userId);
    if (!user) {
      this.logger.warn(
        `User not found for seeding role changed email: ${userId}`
      );
      return;
    }

    if (ws.role === WorkspaceRole.Admin) {
      await this.mailer.trySend({
        name: 'TeamBecomeAdmin',
        to: user.email,
        props: {
          workspace: {
            $$workspaceId: ws.id,
          },
          url: this.url.link(`/workspace/${ws.id}`),
        },
      });
    } else {
      await this.mailer.trySend({
        name: 'TeamBecomeCollaborator',
        to: user.email,
        props: {
          workspace: {
            $$workspaceId: ws.id,
          },
          url: this.url.link(`/workspace/${ws.id}`),
        },
      });
    }
  }

  async sendOwnershipTransferredEmail(email: string, ws: { id: string }) {
    await this.mailer.trySend({
      name: 'OwnershipTransferred',
      to: email,
      props: {
        workspace: {
          $$workspaceId: ws.id,
        },
      },
    });
  }

  async sendOwnershipReceivedEmail(email: string, ws: { id: string }) {
    await this.mailer.trySend({
      name: 'OwnershipReceived',
      to: email,
      props: {
        workspace: {
          $$workspaceId: ws.id,
        },
      },
    });
  }

  async sendLeaveEmail(workspaceId: string, userId: string) {
    const owner = await this.models.workspaceUser.getOwner(workspaceId);
    await this.mailer.trySend({
      name: 'MemberLeave',
      to: owner.email,
      props: {
        workspace: {
          $$workspaceId: workspaceId,
        },
        user: {
          $$userId: userId,
        },
      },
    });
  }

  async allocateSeats(workspaceId: string, quantity: number) {
    const pendings = await this.models.workspaceUser.allocateSeats(
      workspaceId,
      quantity
    );

    if (!pendings.length) {
      return;
    }

    const owner = await this.models.workspaceUser.getOwner(workspaceId);
    for (const member of pendings) {
      try {
        await this.queue.add('notification.sendInvitation', {
          inviterId: member.inviterId ?? owner.id,
          inviteId: member.id,
        });
      } catch (e) {
        this.logger.error('Failed to send invitation notification', e);
      }
    }
  }
}
