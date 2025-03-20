import { Injectable, Logger } from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

import { NotificationNotFound, PaginationInput, URLHelper } from '../../base';
import {
  InvitationNotificationCreate,
  MentionNotification,
  MentionNotificationCreate,
  Models,
  NotificationType,
  UnionNotificationBody,
} from '../../models';
import { DocReader } from '../doc';
import { Mailer } from '../mail';
import { WorkspaceBlobStorage } from '../storage';
import { generateDocPath } from '../utils/doc';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly models: Models,
    private readonly docReader: DocReader,
    private readonly workspaceBlobStorage: WorkspaceBlobStorage,
    private readonly mailer: Mailer,
    private readonly url: URLHelper
  ) {}

  async cleanExpiredNotifications() {
    return await this.models.notification.cleanExpiredNotifications();
  }

  async createMention(input: MentionNotificationCreate) {
    const notification = await this.models.notification.createMention(input);
    await this.sendMentionEmail(input);
    return notification;
  }

  private async sendMentionEmail(input: MentionNotificationCreate) {
    const userSetting = await this.models.settings.get(input.userId);
    if (!userSetting.receiveMentionEmail) {
      return;
    }
    const receiver = await this.models.user.getWorkspaceUser(input.userId);
    if (!receiver) {
      return;
    }
    const doc = await this.models.doc.getMeta(
      input.body.workspaceId,
      input.body.doc.id
    );
    const title = doc?.title ?? input.body.doc.title;
    const url = this.url.link(
      generateDocPath({
        workspaceId: input.body.workspaceId,
        docId: input.body.doc.id,
        mode: input.body.doc.mode,
        blockId: input.body.doc.blockId,
        elementId: input.body.doc.elementId,
      })
    );
    await this.mailer.send({
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
    });
    this.logger.log(`Mention email sent to user ${receiver.id}`);
  }

  async createInvitation(input: InvitationNotificationCreate) {
    const isActive = await this.models.workspaceUser.getActive(
      input.body.workspaceId,
      input.userId
    );
    if (isActive) {
      this.logger.debug(
        `User ${input.userId} is already a active member of workspace ${input.body.workspaceId}, skip creating notification`
      );
      return;
    }
    await this.ensureWorkspaceContentExists(input.body.workspaceId);
    return await this.models.notification.createInvitation(
      input,
      NotificationType.Invitation
    );
  }

  async createInvitationAccepted(input: InvitationNotificationCreate) {
    await this.ensureWorkspaceContentExists(input.body.workspaceId);
    return await this.models.notification.createInvitation(
      input,
      NotificationType.InvitationAccepted
    );
  }

  async createInvitationBlocked(input: InvitationNotificationCreate) {
    await this.ensureWorkspaceContentExists(input.body.workspaceId);
    return await this.models.notification.createInvitation(
      input,
      NotificationType.InvitationBlocked
    );
  }

  async createInvitationRejected(input: InvitationNotificationCreate) {
    await this.ensureWorkspaceContentExists(input.body.workspaceId);
    return await this.models.notification.createInvitation(
      input,
      NotificationType.InvitationRejected
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
        err instanceof PrismaClientKnownRequestError &&
        err.code === 'P2025'
      ) {
        // https://www.prisma.io/docs/orm/reference/error-reference#p2025
        throw new NotificationNotFound();
      }
      throw err;
    }
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
      workspaces.map(w => [
        w.id,
        {
          id: w.id,
          name: w.name ?? '',
          avatarUrl: w.avatarKey
            ? this.workspaceBlobStorage.getAvatarUrl(w.id, w.avatarKey)
            : undefined,
        },
      ])
    );

    // fill latest doc title
    const mentions = notifications.filter(
      n => n.type === NotificationType.Mention
    ) as MentionNotification[];
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
}
