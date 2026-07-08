import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { NotificationNotFound, PaginationInput, URLHelper } from '../../base';
import {
  CommentNotification,
  CommentNotificationCreate,
  DEFAULT_WORKSPACE_NAME,
  InvitationNotificationCreate,
  InvitationReviewDeclinedNotificationCreate,
  MentionNotification,
  MentionNotificationCreate,
  Models,
  NotificationType,
  UnionNotificationBody,
  Workspace,
} from '../../models';
import { BackendRuntimeProvider } from '../backend-runtime';
import { containsUrlOrDomain } from '../content-policy';
import { DocReader } from '../doc';
import { Mailer } from '../mail';
import type { SendMailCommand } from '../mail/types';
import { realtimeNotificationRoom, RealtimePublisher } from '../realtime';
import { generateDocPath } from '../utils/doc';
import {
  generateWorkspaceSettingsPath,
  WorkspaceSettingsTab,
} from '../utils/workspace';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly models: Models,
    private readonly docReader: DocReader,
    private readonly mailer: Mailer,
    private readonly url: URLHelper,
    private readonly realtime: RealtimePublisher,
    private readonly runtime: BackendRuntimeProvider
  ) {}

  async cleanExpiredNotifications() {
    const userIds =
      await this.models.notification.findExpiredNotificationUserIds();
    const count = await this.models.notification.cleanExpiredNotifications();
    if (count > 0) {
      await Promise.all(
        userIds.map(userId =>
          this.publishCountChanged(userId, 'expired-cleanup')
        )
      );
    }
    return count;
  }

  async createComment(input: CommentNotificationCreate, isMention?: boolean) {
    const notification = isMention
      ? await this.models.notification.createCommentMention(input)
      : await this.models.notification.createComment(input);
    await this.sendCommentEmail(input, isMention, notification.id);
    await this.publishCountChanged(input.userId, 'created');
    return notification;
  }

  private async sendCommentEmail(
    input: CommentNotificationCreate,
    isMention?: boolean,
    notificationId?: string
  ) {
    const receiver = await this.models.user.getWorkspaceUser(input.userId);
    if (!receiver) {
      return;
    }
    const userSetting = await this.models.userSettings.get(input.userId);
    const doc = await this.models.doc.getMeta(
      input.body.workspaceId,
      input.body.doc.id
    );
    const title = doc?.title || input.body.doc.title;
    const url = this.url.link(
      generateDocPath({
        workspaceId: input.body.workspaceId,
        docId: input.body.doc.id,
        mode: input.body.doc.mode,
        blockId: input.body.doc.blockId,
        elementId: input.body.doc.elementId,
        commentId: input.body.commentId,
        replyId: input.body.replyId,
      })
    );
    const command: SendMailCommand = {
      name: isMention ? 'CommentMention' : 'Comment',
      to: receiver.email,
      props: {
        user: {
          $$userId: input.body.createdByUserId,
        },
        doc: {
          title,
          url,
        },
      },
      metadata: {
        dedupeKey: notificationId
          ? `notification:${notificationId}:mail:${isMention ? 'CommentMention' : 'Comment'}`
          : undefined,
        recipientUserId: receiver.id,
        actorUserId: input.body.createdByUserId,
        workspaceId: input.body.workspaceId,
        notificationId,
        source: { trusted: false },
      },
    };
    if (!userSetting.receiveCommentEmail) {
      await this.mailer.skip(command, {
        mailClass: 'collaboration_notice',
        reason: 'recipient_notification_disabled',
      });
      return;
    }
    await this.trySendMail(command, 'collaboration_notice');
    this.logger.debug(`Comment email sent to user ${receiver.id}`);
  }

  async createMention(input: MentionNotificationCreate) {
    const notification = await this.models.notification.createMention(input);
    await this.sendMentionEmail(input, notification.id);
    await this.publishCountChanged(input.userId, 'created');
    return notification;
  }

  private async sendMentionEmail(
    input: MentionNotificationCreate,
    notificationId?: string
  ) {
    const receiver = await this.models.user.getWorkspaceUser(input.userId);
    if (!receiver) {
      return;
    }
    const userSetting = await this.models.userSettings.get(input.userId);
    const doc = await this.models.doc.getMeta(
      input.body.workspaceId,
      input.body.doc.id
    );
    const title = doc?.title || input.body.doc.title;
    const url = this.url.link(
      generateDocPath({
        workspaceId: input.body.workspaceId,
        docId: input.body.doc.id,
        mode: input.body.doc.mode,
        blockId: input.body.doc.blockId,
        elementId: input.body.doc.elementId,
      })
    );
    const command: SendMailCommand = {
      name: 'Mention',
      to: receiver.email,
      props: {
        user: {
          $$userId: input.body.createdByUserId,
        },
        doc: {
          title,
          url,
        },
      },
      metadata: {
        dedupeKey: notificationId
          ? `notification:${notificationId}:mail:Mention`
          : undefined,
        recipientUserId: receiver.id,
        actorUserId: input.body.createdByUserId,
        workspaceId: input.body.workspaceId,
        notificationId,
        source: { trusted: false },
      },
    };
    if (!userSetting.receiveMentionEmail) {
      await this.mailer.skip(command, {
        mailClass: 'collaboration_notice',
        reason: 'recipient_notification_disabled',
      });
      return;
    }
    await this.trySendMail(command, 'collaboration_notice');
    this.logger.debug(`Mention email sent to user ${receiver.id}`);
  }

  async createInvitation(input: InvitationNotificationCreate) {
    const workspaceId = input.body.workspaceId;
    const userId = input.userId;
    if (await this.isActiveWorkspaceUser(workspaceId, userId)) {
      return;
    }
    await this.ensureWorkspaceContentExists(workspaceId);
    const notification = await this.models.notification.createInvitation(
      input,
      NotificationType.Invitation
    );
    await this.sendInvitationEmail(input, notification.id);
    await this.publishCountChanged(input.userId, 'created');
    return notification;
  }

  private async sendInvitationEmail(
    input: InvitationNotificationCreate,
    notificationId?: string
  ) {
    const inviteUrl = this.url.link(`/invite/${input.body.inviteId}`);
    if (env.dev) {
      // make it easier to test in dev mode
      this.logger.debug(`Invite link: ${inviteUrl}`);
    }
    const receiver = await this.models.user.getWorkspaceUser(input.userId);
    if (!receiver) {
      return;
    }
    const command: SendMailCommand = {
      name: 'MemberInvitation',
      to: receiver.email,
      props: {
        user: {
          $$userId: input.body.createdByUserId,
        },
        workspace: {
          $$workspaceId: input.body.workspaceId,
        },
        url: inviteUrl,
      },
      metadata: {
        dedupeKey: notificationId
          ? `notification:${notificationId}:mail:MemberInvitation`
          : `invite:${input.body.inviteId}:mail:MemberInvitation`,
        recipientUserId: receiver.id,
        actorUserId: input.body.createdByUserId,
        workspaceId: input.body.workspaceId,
        notificationId,
        source: { trusted: false },
      },
    };
    const workspace = await this.docReader.getWorkspaceContent(
      input.body.workspaceId
    );
    if (containsUrlOrDomain(workspace?.name)) {
      this.logger.warn(
        `Skip invitation email for workspace ${input.body.workspaceId}, reason=workspace name contains url or domain`
      );
      await this.mailer.skip(command, {
        mailClass: 'workspace_invitation',
        reason: 'workspace_name_contains_domain',
      });
      return;
    }

    const userSetting = await this.models.userSettings.get(input.userId);
    if (!userSetting.receiveInvitationEmail) {
      await this.mailer.skip(command, {
        mailClass: 'workspace_invitation',
        reason: 'recipient_notification_disabled',
      });
      return;
    }
    await this.trySendMail(command, 'workspace_invitation');
    this.logger.debug(
      `Invitation email sent to user ${receiver.id} for workspace ${input.body.workspaceId}`
    );
  }

  async createInvitationAccepted(input: InvitationNotificationCreate) {
    const workspaceId = input.body.workspaceId;
    if (
      !(await this.isActiveWorkspaceUser(
        workspaceId,
        input.body.createdByUserId
      ))
    ) {
      return;
    }
    await this.ensureWorkspaceContentExists(workspaceId);
    const notification = await this.models.notification.createInvitation(
      input,
      NotificationType.InvitationAccepted
    );
    await this.sendInvitationAcceptedEmail(input, notification.id);
    await this.publishCountChanged(input.userId, 'created');
    return notification;
  }

  private async sendInvitationAcceptedEmail(
    input: InvitationNotificationCreate,
    notificationId?: string
  ) {
    const inviterUserId = input.userId;
    const inviteeUserId = input.body.createdByUserId;
    const workspaceId = input.body.workspaceId;
    const inviter = await this.models.user.getWorkspaceUser(inviterUserId);
    if (!inviter) {
      return;
    }
    const command: SendMailCommand = {
      name: 'MemberAccepted',
      to: inviter.email,
      props: {
        user: {
          $$userId: inviteeUserId,
        },
        workspace: {
          $$workspaceId: workspaceId,
        },
        url: this.url.link(
          generateWorkspaceSettingsPath({
            workspaceId,
            tab: WorkspaceSettingsTab.members,
          })
        ),
      },
      metadata: {
        dedupeKey: notificationId
          ? `notification:${notificationId}:mail:MemberAccepted`
          : undefined,
        recipientUserId: inviter.id,
        actorUserId: inviteeUserId,
        workspaceId,
        notificationId,
        source: { trusted: false },
      },
    };
    const userSetting = await this.models.userSettings.get(inviterUserId);
    if (!userSetting.receiveInvitationEmail) {
      await this.mailer.skip(command, {
        mailClass: 'workspace_lifecycle',
        reason: 'recipient_notification_disabled',
      });
      return;
    }
    await this.trySendMail(command, 'workspace_lifecycle');
    this.logger.debug(
      `Invitation accepted email sent to user ${inviter.id} for workspace ${workspaceId}`
    );
  }

  async createInvitationBlocked(input: InvitationNotificationCreate) {
    await this.ensureWorkspaceContentExists(input.body.workspaceId);
    const notification = await this.models.notification.createInvitation(
      input,
      NotificationType.InvitationBlocked
    );
    await this.publishCountChanged(input.userId, 'created');
    return notification;
  }

  async createInvitationRejected(input: InvitationNotificationCreate) {
    await this.ensureWorkspaceContentExists(input.body.workspaceId);
    const notification = await this.models.notification.createInvitation(
      input,
      NotificationType.InvitationRejected
    );
    await this.publishCountChanged(input.userId, 'created');
    return notification;
  }

  async createInvitationReviewRequest(input: InvitationNotificationCreate) {
    const workspaceId = input.body.workspaceId;
    if (
      await this.isActiveWorkspaceUser(workspaceId, input.body.createdByUserId)
    ) {
      return;
    }
    await this.ensureWorkspaceContentExists(workspaceId);
    const notification = await this.models.notification.createInvitation(
      input,
      NotificationType.InvitationReviewRequest
    );
    await this.sendInvitationReviewRequestEmail(input, notification.id);
    await this.publishCountChanged(input.userId, 'created');
    return notification;
  }

  private async sendInvitationReviewRequestEmail(
    input: InvitationNotificationCreate,
    notificationId?: string
  ) {
    const inviteeUserId = input.body.createdByUserId;
    const reviewerUserId = input.userId;
    const workspaceId = input.body.workspaceId;
    const reviewer = await this.models.user.getWorkspaceUser(reviewerUserId);
    if (!reviewer) {
      return;
    }
    await this.trySendMail(
      {
        name: 'LinkInvitationReviewRequest',
        to: reviewer.email,
        props: {
          user: {
            $$userId: inviteeUserId,
          },
          workspace: {
            $$workspaceId: workspaceId,
          },
          url: this.url.link(
            generateWorkspaceSettingsPath({
              workspaceId,
              tab: WorkspaceSettingsTab.members,
            })
          ),
        },
        metadata: {
          dedupeKey: notificationId
            ? `notification:${notificationId}:mail:LinkInvitationReviewRequest`
            : undefined,
          recipientUserId: reviewer.id,
          actorUserId: inviteeUserId,
          workspaceId,
          notificationId,
          source: { trusted: false },
        },
      },
      'workspace_invitation'
    );
    this.logger.debug(
      `Invitation review request email sent to user ${reviewer.id} for workspace ${workspaceId}`
    );
  }

  async createInvitationReviewApproved(input: InvitationNotificationCreate) {
    const workspaceId = input.body.workspaceId;
    const userId = input.userId;
    if (!(await this.isActiveWorkspaceUser(workspaceId, userId))) {
      return;
    }
    await this.ensureWorkspaceContentExists(workspaceId);
    const notification = await this.models.notification.createInvitation(
      input,
      NotificationType.InvitationReviewApproved
    );
    await this.sendInvitationReviewApprovedEmail(input, notification.id);
    await this.publishCountChanged(input.userId, 'created');
    return notification;
  }

  private async sendInvitationReviewApprovedEmail(
    input: InvitationNotificationCreate,
    notificationId?: string
  ) {
    const workspaceId = input.body.workspaceId;
    const receiverUserId = input.userId;
    const receiver = await this.models.user.getWorkspaceUser(receiverUserId);
    if (!receiver) {
      return;
    }
    await this.trySendMail(
      {
        name: 'LinkInvitationApprove',
        to: receiver.email,
        props: {
          workspace: {
            $$workspaceId: workspaceId,
          },
          url: this.url.link(`/workspace/${workspaceId}`),
        },
        metadata: {
          dedupeKey: notificationId
            ? `notification:${notificationId}:mail:LinkInvitationApprove`
            : undefined,
          recipientUserId: receiver.id,
          actorUserId: input.body.createdByUserId,
          workspaceId,
          notificationId,
          source: { trusted: false },
        },
      },
      'workspace_invitation'
    );
    this.logger.debug(
      `Invitation review approved email sent to user ${receiver.id} for workspace ${workspaceId}`
    );
  }

  async createInvitationReviewDeclined(
    input: InvitationReviewDeclinedNotificationCreate
  ) {
    const workspaceId = input.body.workspaceId;
    const userId = input.userId;
    if (await this.isActiveWorkspaceUser(workspaceId, userId)) {
      return;
    }
    await this.ensureWorkspaceContentExists(workspaceId);
    const notification =
      await this.models.notification.createInvitationReviewDeclined(input);
    await this.sendInvitationReviewDeclinedEmail(input, notification.id);
    await this.publishCountChanged(input.userId, 'created');
    return notification;
  }

  private async sendInvitationReviewDeclinedEmail(
    input: InvitationReviewDeclinedNotificationCreate,
    notificationId?: string
  ) {
    const workspaceId = input.body.workspaceId;
    const receiverUserId = input.userId;
    const receiver = await this.models.user.getWorkspaceUser(receiverUserId);
    if (!receiver) {
      return;
    }
    await this.trySendMail(
      {
        name: 'LinkInvitationDecline',
        to: receiver.email,
        props: {
          workspace: {
            $$workspaceId: workspaceId,
          },
        },
        metadata: {
          dedupeKey: notificationId
            ? `notification:${notificationId}:mail:LinkInvitationDecline`
            : undefined,
          recipientUserId: receiver.id,
          actorUserId: input.body.createdByUserId,
          workspaceId,
          notificationId,
          source: { trusted: false },
        },
      },
      'workspace_invitation'
    );
    this.logger.debug(
      `Invitation review declined email sent to user ${receiver.id} for workspace ${workspaceId}`
    );
  }

  private async ensureWorkspaceContentExists(workspaceId: string) {
    await this.docReader.getWorkspaceContent(workspaceId);
  }

  async markAsRead(userId: string, notificationId: string) {
    try {
      await this.models.notification.markAsRead(notificationId, userId);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        // https://www.prisma.io/docs/orm/reference/error-reference#p2025
        throw new NotificationNotFound();
      }
      throw err;
    }
    await this.publishCountChanged(userId, 'read');
  }

  async markAllAsRead(userId: string) {
    await this.models.notification.markAllAsRead(userId);
    await this.publishCountChanged(userId, 'read-all');
  }

  /**
   * Find notifications by user id, order by createdAt desc
   */
  async findManyByUserId(userId: string, options?: PaginationInput) {
    const notifications = await this.models.notification.findManyByUserId(
      userId,
      options
    );

    // fill user info
    const userIds = new Set(notifications.map(n => n.body.createdByUserId));
    const users = await this.models.user.getPublicUsers(Array.from(userIds));
    const userInfos = new Map(users.map(u => [u.id, u]));

    // fill workspace info
    const workspaceIds = new Set(notifications.map(n => n.body.workspaceId));
    const workspaces = await this.models.workspace.findMany(
      Array.from(workspaceIds)
    );
    const workspaceInfos = new Map(
      workspaces.map(w => [w.id, this.formatWorkspaceInfo(w)])
    );

    // fill latest doc title
    const mentions = notifications.filter(
      n =>
        n.type === NotificationType.Mention ||
        n.type === NotificationType.CommentMention ||
        n.type === NotificationType.Comment
    ) as (MentionNotification | CommentNotification)[];
    const mentionDocs = await this.models.doc.findMetas(
      mentions.map(m => ({
        workspaceId: m.body.workspaceId,
        docId: m.body.doc.id,
      }))
    );
    for (const [index, mention] of mentions.entries()) {
      const doc = mentionDocs[index];
      if (doc?.title) {
        // use the latest doc title
        mention.body.doc.title = doc.title;
      }
    }

    return notifications.map(n => ({
      ...n,
      body: {
        ...(n.body as UnionNotificationBody),
        // set type to body.type to improve type inference on frontend
        type: n.type,
        workspace: workspaceInfos.get(n.body.workspaceId),
        createdByUser: userInfos.get(n.body.createdByUserId),
      },
    }));
  }

  async countByUserId(userId: string) {
    return await this.models.notification.countByUserId(userId);
  }

  private async publishCountChanged(
    userId: string,
    reason: 'created' | 'read' | 'read-all' | 'expired-cleanup'
  ) {
    if (!this.realtime) return;
    try {
      this.realtime.publish(
        'notification.count.changed',
        {},
        { count: await this.countByUserId(userId), reason },
        { room: realtimeNotificationRoom(userId) }
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish notification count for user ${userId}`,
        error
      );
    }
  }

  private formatWorkspaceInfo(workspace: Workspace) {
    return {
      id: workspace.id,
      name: workspace.name ?? DEFAULT_WORKSPACE_NAME,
      // TODO(@fengmk2): workspace avatar url is not public access by default, impl it in future
      // avatarUrl: this.workspaceBlobStorage.getAvatarUrl(
      //   workspace.id,
      //   workspace.avatarKey
      // ),
      url: this.url.link(`/workspace/${workspace.id}`),
    };
  }

  private async isActiveWorkspaceUser(workspaceId: string, userId: string) {
    const isActive = await this.models.workspaceUser.getActive(
      workspaceId,
      userId
    );
    return !!isActive;
  }

  private async trySendMail(command: SendMailCommand, mailClass: string) {
    const actorUserId = command.metadata?.actorUserId;
    if (
      actorUserId &&
      (await this.runtime.isInviteAbuseUserQuarantinedOrBanned(actorUserId))
    ) {
      await this.mailer.skip(command, {
        mailClass,
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
        mailClass,
        reason: 'workspace_quarantined',
      });
      return false;
    }

    return await this.mailer.trySend(command);
  }
}
