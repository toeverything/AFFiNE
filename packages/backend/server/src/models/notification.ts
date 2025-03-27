import { Injectable } from '@nestjs/common';
import {
  Notification,
  NotificationLevel,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { z } from 'zod';

import { PaginationInput } from '../base';
import { BaseModel } from './base';
import { DocMode } from './common';

export { NotificationLevel, NotificationType };
export type { Notification };

// #region input

export const ONE_YEAR = 1000 * 60 * 60 * 24 * 365;
const IdSchema = z.string().trim().min(1).max(100);

export const BaseNotificationCreateSchema = z.object({
  userId: IdSchema,
  level: z
    .nativeEnum(NotificationLevel)
    .optional()
    .default(NotificationLevel.Default),
});

export const MentionDocSchema = z.object({
  id: IdSchema,
  // Allow empty string, will display as `Untitled` at frontend
  title: z.string().trim().max(255),
  mode: z.nativeEnum(DocMode),
  // blockId or elementId is required at least one
  blockId: IdSchema.optional(),
  elementId: IdSchema.optional(),
});

export type MentionDoc = z.infer<typeof MentionDocSchema>;
export type MentionDocCreate = z.input<typeof MentionDocSchema>;

const MentionNotificationBodySchema = z.object({
  workspaceId: IdSchema,
  createdByUserId: IdSchema,
  doc: MentionDocSchema,
});

export type MentionNotificationBody = z.infer<
  typeof MentionNotificationBodySchema
>;

export const MentionNotificationCreateSchema =
  BaseNotificationCreateSchema.extend({
    body: MentionNotificationBodySchema,
  });

export type MentionNotificationCreate = z.input<
  typeof MentionNotificationCreateSchema
>;

const InvitationNotificationBodySchema = z.object({
  workspaceId: IdSchema,
  createdByUserId: IdSchema,
  inviteId: IdSchema,
});

export type InvitationNotificationBody = z.infer<
  typeof InvitationNotificationBodySchema
>;

export const InvitationNotificationCreateSchema =
  BaseNotificationCreateSchema.extend({
    body: InvitationNotificationBodySchema,
  });

export type InvitationNotificationCreate = z.input<
  typeof InvitationNotificationCreateSchema
>;

const InvitationReviewDeclinedNotificationBodySchema = z.object({
  workspaceId: IdSchema,
  createdByUserId: IdSchema,
});

export type InvitationReviewDeclinedNotificationBody = z.infer<
  typeof InvitationReviewDeclinedNotificationBodySchema
>;

export const InvitationReviewDeclinedNotificationCreateSchema =
  BaseNotificationCreateSchema.extend({
    body: InvitationReviewDeclinedNotificationBodySchema,
  });

export type InvitationReviewDeclinedNotificationCreate = z.input<
  typeof InvitationReviewDeclinedNotificationCreateSchema
>;

export type UnionNotificationBody =
  | MentionNotificationBody
  | InvitationNotificationBody
  | InvitationReviewDeclinedNotificationBody;

// #endregion

// #region output

export type MentionNotification = Notification &
  z.infer<typeof MentionNotificationCreateSchema>;

export type InvitationNotification = Notification &
  z.infer<typeof InvitationNotificationCreateSchema>;

export type InvitationReviewDeclinedNotification = Notification &
  z.infer<typeof InvitationReviewDeclinedNotificationCreateSchema>;

export type UnionNotification =
  | MentionNotification
  | InvitationNotification
  | InvitationReviewDeclinedNotification;

// #endregion

@Injectable()
export class NotificationModel extends BaseModel {
  // #region mention

  async createMention(input: MentionNotificationCreate) {
    const data = MentionNotificationCreateSchema.parse(input);
    const row = await this.create({
      userId: data.userId,
      level: data.level,
      type: NotificationType.Mention,
      body: data.body,
    });
    this.logger.log(
      `Created mention notification:${row.id} for user:${data.userId} in workspace:${data.body.workspaceId}`
    );
    return row as MentionNotification;
  }

  // #endregion

  // #region invitation

  async createInvitation(
    input: InvitationNotificationCreate,
    type: NotificationType = NotificationType.Invitation
  ) {
    const data = InvitationNotificationCreateSchema.parse(input);
    const row = await this.create({
      userId: data.userId,
      level: data.level,
      type,
      body: data.body,
    });
    this.logger.log(
      `Created ${type} notification ${row.id} to user ${data.userId} in workspace ${data.body.workspaceId}`
    );
    return row as InvitationNotification;
  }

  async createInvitationReviewDeclined(
    input: InvitationReviewDeclinedNotificationCreate
  ) {
    const data = InvitationReviewDeclinedNotificationCreateSchema.parse(input);
    const type = NotificationType.InvitationReviewDeclined;
    const row = await this.create({
      userId: data.userId,
      level: data.level,
      type,
      body: data.body,
    });
    this.logger.log(
      `Created ${type} notification ${row.id} to user ${data.userId} in workspace ${data.body.workspaceId}`
    );
    return row as InvitationReviewDeclinedNotification;
  }

  // #endregion

  // #region common

  private async create(data: Prisma.NotificationUncheckedCreateInput) {
    return await this.db.notification.create({
      data,
    });
  }

  async markAsRead(notificationId: string, userId: string) {
    await this.db.notification.update({
      where: { id: notificationId, userId },
      data: {
        read: true,
      },
    });
  }

  /**
   * Find many notifications by user id, exclude read notifications by default
   */
  async findManyByUserId(
    userId: string,
    options?: {
      includeRead?: boolean;
    } & PaginationInput
  ) {
    const rows = await this.db.notification.findMany({
      where: {
        userId,
        ...(options?.includeRead ? {} : { read: false }),
        ...(options?.after ? { createdAt: { gt: options.after } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      skip: options?.offset,
      take: options?.first,
    });
    return rows as UnionNotification[];
  }

  async countByUserId(userId: string, options: { includeRead?: boolean } = {}) {
    return this.db.notification.count({
      where: {
        userId,
        ...(options.includeRead ? {} : { read: false }),
      },
    });
  }

  async get(notificationId: string) {
    const row = await this.db.notification.findUnique({
      where: { id: notificationId },
    });
    return row as UnionNotification;
  }

  async cleanExpiredNotifications() {
    const { count } = await this.db.notification.deleteMany({
      // delete notifications that are older than one year
      where: { createdAt: { lte: new Date(Date.now() - ONE_YEAR) } },
    });
    this.logger.log(`Deleted ${count} expired notifications`);
    return count;
  }

  // #endregion
}
