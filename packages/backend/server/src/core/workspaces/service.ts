import { Injectable, Logger } from '@nestjs/common';
import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';

import { Cache, NotFound, OnEvent, URLHelper } from '../../base';
import {
  DEFAULT_WORKSPACE_AVATAR,
  DEFAULT_WORKSPACE_NAME,
  Models,
} from '../../models';
import { BackendRuntimeProvider } from '../backend-runtime';
import { DocReader, PgWorkspaceDocStorageAdapter } from '../doc';
import { Mailer } from '../mail';
import type { SendMailCommand } from '../mail/types';
import { NotificationService } from '../notification/service';
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
    private readonly notifications: NotificationService,
    private readonly workspaceDocs: PgWorkspaceDocStorageAdapter,
    private readonly storageRuntime: StorageRuntimeProvider,
    private readonly runtime: BackendRuntimeProvider,
    private readonly txHost: TransactionHost<TransactionalAdapterPrisma>
  ) {}

  @OnEvent('user.preDelete')
  async onUserPreDelete({ id }: Events['user.preDelete']) {
    const workspaces = await this.models.user.ownedWorkspaces(id);
    for (const workspace of workspaces) {
      await this.delete(workspace.workspaceId, id);
    }
  }

  async delete(workspaceId: string, ownerId?: string) {
    const storageUserIds = await this.deleteWorkspaceRows(workspaceId, ownerId);
    if (!storageUserIds) return;
    try {
      await this.storageRuntime.deleteWorkspaceObjects(
        workspaceId,
        storageUserIds
      );
    } catch (error) {
      this.logger.error(
        `Workspace object cleanup will be reconciled: ${workspaceId}`,
        error
      );
    }
  }

  @Transactional<TransactionalAdapterPrisma>({ timeout: 120_000 })
  private async deleteWorkspaceRows(workspaceId: string, ownerId?: string) {
    const tx = this.txHost.tx;
    const lockKey = `storage-workspace:${workspaceId}`;
    while (true) {
      const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) AS locked
      `;
      if (lock?.locked) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }

    if (
      ownerId &&
      !(await tx.workspaceMember.findFirst({
        where: { workspaceId, userId: ownerId, role: 'owner', state: 'active' },
      }))
    )
      return;

    const [members, sessions] = await Promise.all([
      tx.workspaceMember.findMany({
        where: { workspaceId },
        select: { userId: true },
      }),
      tx.aiSession.findMany({
        where: { workspaceId },
        select: { userId: true },
        distinct: ['userId'],
      }),
    ]);
    const storageUserIds = [
      ...new Set([
        ...members.map(member => member.userId),
        ...sessions.map(session => session.userId),
      ]),
    ];
    await this.workspaceDocs.deleteSpace(workspaceId);
    await this.models.workspace.delete(workspaceId);
    return storageUserIds;
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
      try {
        const owner = await this.models.workspaceUser.getOwner(workspaceId);
        avatar = (
          await this.runtime.readWorkspaceAvatarV1(
            owner.id,
            workspaceId,
            workspaceContent.avatarKey
          )
        ).toString('base64');
      } catch (error) {
        this.logger.warn(
          `Failed to read avatar for workspace ${workspaceId}`,
          error
        );
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
    const invite = await this.models.workspaceUser.getById(inviteId);
    if (!invite) return;
    await this.notifications.createInvitationAccepted({
      userId: inviterId,
      body: {
        workspaceId: invite.workspaceId,
        createdByUserId: invite.userId,
        inviteId,
      },
    });
  }
  async sendInvitationNotification(inviterId: string, inviteId: string) {
    const invite = await this.models.workspaceUser.getById(inviteId);
    if (!invite) return;
    await this.notifications.createInvitation({
      userId: invite.userId,
      body: {
        workspaceId: invite.workspaceId,
        createdByUserId: inviterId,
        inviteId,
      },
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
        await this.notifications.createInvitationReviewRequest({
          userId: reviewer.id,
          body: {
            workspaceId,
            createdByUserId: inviteeUserId,
            inviteId,
          },
        });
      })
    );
  }

  async sendReviewApprovedNotification(inviteId: string, reviewerId: string) {
    const invite = await this.models.workspaceUser.getById(inviteId);
    if (!invite) return;
    await this.notifications.createInvitationReviewApproved({
      userId: invite.userId,
      body: {
        workspaceId: invite.workspaceId,
        createdByUserId: reviewerId,
        inviteId,
      },
    });
  }

  async sendReviewDeclinedNotification(
    userId: string,
    workspaceId: string,
    reviewerId: string
  ) {
    await this.notifications.createInvitationReviewDeclined({
      userId,
      body: {
        workspaceId,
        createdByUserId: reviewerId,
      },
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
