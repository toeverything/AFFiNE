import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { Cache, JobQueue, NotFound, URLHelper } from '../../base';
import {
  DEFAULT_WORKSPACE_AVATAR,
  DEFAULT_WORKSPACE_NAME,
  Models,
} from '../../models';
import { BackendRuntimeProvider } from '../backend-runtime';
import { DocReader, PgWorkspaceDocStorageAdapter } from '../doc';
import { Mailer } from '../mail';
import type { SendMailCommand } from '../mail/types';
import { WorkspaceRole } from '../permission';
import { StorageRuntimeProvider } from '../storage-runtime';

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
    private readonly mailer: Mailer,
    private readonly queue: JobQueue,
    private readonly runtime: BackendRuntimeProvider,
    private readonly db: PrismaClient,
    private readonly storageRuntime: StorageRuntimeProvider,
    private readonly workspaceDocs: PgWorkspaceDocStorageAdapter
  ) {}

  async delete(workspaceId: string) {
    const deletedAt = new Date();
    await this.db.$transaction([
      this.db.blob.updateMany({
        where: { workspaceId, deletedAt: null },
        data: { deletedAt },
      }),
      this.db.commentAttachment.updateMany({
        where: { workspaceId, deletedAt: null },
        data: { deletedAt },
      }),
    ]);
    await this.storageRuntime.deleteWorkspaceObjects(workspaceId);
    await this.models.workspace.delete(workspaceId);
    await this.workspaceDocs.deleteSpace(workspaceId);
  }

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
      const owner = await this.models.workspaceUser.getOwner(workspaceId);
      avatar = (
        await this.runtime.readWorkspaceAvatarV1(
          owner.id,
          workspaceId,
          workspaceContent.avatarKey
        )
      ).toString('base64');
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
    const state = await this.runtime.getWorkspaceQuotaStateV1(workspaceId);
    return !state.usesOwnerQuota;
  }

  async sendTeamWorkspaceUpgradedEmail(workspaceId: string) {
    const owner = await this.models.workspaceUser.getOwner(workspaceId);
    const admins = await this.models.workspaceUser.getAdmins(workspaceId);

    const link = this.url.link(`/workspace/${workspaceId}`);
    await this.trySendWorkspaceMail({
      name: 'TeamWorkspaceUpgraded',
      to: owner.email,
      props: {
        workspace: {
          $$workspaceId: workspaceId,
        },
        isOwner: true,
        url: link,
      },
      metadata: {
        workspaceId,
        recipientUserId: owner.id,
        source: { trusted: false },
      },
    });

    await Promise.allSettled(
      admins.map(async user => {
        await this.trySendWorkspaceMail({
          name: 'TeamWorkspaceUpgraded',
          to: user.email,
          props: {
            workspace: {
              $$workspaceId: workspaceId,
            },
            isOwner: false,
            url: link,
          },
          metadata: {
            workspaceId,
            recipientUserId: user.id,
            source: { trusted: false },
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
      await this.trySendWorkspaceMail({
        name: 'TeamBecomeAdmin',
        to: user.email,
        props: {
          workspace: {
            $$workspaceId: ws.id,
          },
          url: this.url.link(`/workspace/${ws.id}`),
        },
        metadata: {
          workspaceId: ws.id,
          recipientUserId: user.id,
          source: { trusted: false },
        },
      });
    } else {
      await this.trySendWorkspaceMail({
        name: 'TeamBecomeCollaborator',
        to: user.email,
        props: {
          workspace: {
            $$workspaceId: ws.id,
          },
          url: this.url.link(`/workspace/${ws.id}`),
        },
        metadata: {
          workspaceId: ws.id,
          recipientUserId: user.id,
          source: { trusted: false },
        },
      });
    }
  }

  async sendOwnershipTransferredEmail(email: string, ws: { id: string }) {
    await this.trySendWorkspaceMail({
      name: 'OwnershipTransferred',
      to: email,
      props: {
        workspace: {
          $$workspaceId: ws.id,
        },
      },
      metadata: {
        workspaceId: ws.id,
        source: { trusted: false },
      },
    });
  }

  async sendOwnershipReceivedEmail(email: string, ws: { id: string }) {
    await this.trySendWorkspaceMail({
      name: 'OwnershipReceived',
      to: email,
      props: {
        workspace: {
          $$workspaceId: ws.id,
        },
      },
      metadata: {
        workspaceId: ws.id,
        source: { trusted: false },
      },
    });
  }

  async sendLeaveEmail(workspaceId: string, userId: string) {
    const owner = await this.models.workspaceUser.getOwner(workspaceId);
    await this.trySendWorkspaceMail({
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
      metadata: {
        workspaceId,
        recipientUserId: owner.id,
        actorUserId: userId,
        source: { trusted: false },
      },
    });
  }

  private async trySendWorkspaceMail(command: SendMailCommand) {
    const actorUserId = command.metadata?.actorUserId;
    if (
      actorUserId &&
      (await this.runtime.isInviteAbuseUserQuarantinedOrBanned(actorUserId))
    ) {
      await this.mailer.skip(command, {
        mailClass: 'workspace_lifecycle',
        reason: 'actor_quarantined',
      });
      return false;
    }
    const workspaceId = command.metadata?.workspaceId;
    if (
      workspaceId &&
      (await this.runtime.isInviteAbuseWorkspaceQuarantined(workspaceId))
    ) {
      await this.mailer.skip(command, {
        mailClass: 'workspace_lifecycle',
        reason: 'workspace_quarantined',
      });
      return false;
    }
    return await this.mailer.trySend(command);
  }
}
