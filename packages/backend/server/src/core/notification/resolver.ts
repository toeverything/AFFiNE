import {
  Args,
  ID,
  Int,
  Mutation,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';

import {
  MentionUserDocAccessDenied,
  MentionUserOneselfDenied,
} from '../../base/error';
import { paginate, PaginationInput } from '../../base/graphql';
import { MentionNotificationCreateSchema } from '../../models';
import { CurrentUser } from '../auth/session';
import { AccessController } from '../permission';
import { UserType } from '../user';
import { NotificationService } from './service';
import {
  MentionInput,
  NotificationObjectType,
  PaginatedNotificationObjectType,
  UnionNotificationBodyType,
} from './types';

@Resolver(() => UserType)
export class UserNotificationResolver {
  constructor(
    private readonly service: NotificationService,
    private readonly ac: AccessController
  ) {}

  @ResolveField(() => PaginatedNotificationObjectType, {
    description: 'Get current user notifications',
  })
  async notifications(
    @CurrentUser() me: UserType,
    @Args('pagination', PaginationInput.decode) pagination: PaginationInput
  ): Promise<PaginatedNotificationObjectType> {
    const [notifications, totalCount] = await Promise.all([
      this.service.findManyByUserId(me.id, pagination),
      this.service.countByUserId(me.id),
    ]);
    return paginate(notifications, 'createdAt', pagination, totalCount);
  }

  @ResolveField(() => Int, {
    description: 'Get user notification count',
  })
  async notificationCount(@CurrentUser() me: UserType): Promise<number> {
    return await this.service.countByUserId(me.id);
  }

  @Mutation(() => ID, {
    description: 'mention user in a doc',
  })
  async mentionUser(
    @CurrentUser() me: UserType,
    @Args('input') input: MentionInput
  ) {
    const parsedInput = MentionNotificationCreateSchema.parse({
      userId: input.userId,
      body: {
        workspaceId: input.workspaceId,
        doc: input.doc,
        createdByUserId: me.id,
      },
    });
    if (parsedInput.userId === me.id) {
      throw new MentionUserOneselfDenied();
    }
    // currentUser can update the doc
    await this.ac
      .user(me.id)
      .doc(parsedInput.body.workspaceId, parsedInput.body.doc.id)
      .assert('Doc.Update');
    // mention user can read the doc
    if (
      !(await this.ac
        .user(parsedInput.userId)
        .doc(parsedInput.body.workspaceId, parsedInput.body.doc.id)
        .can('Doc.Read'))
    ) {
      throw new MentionUserDocAccessDenied({
        docId: parsedInput.body.doc.id,
      });
    }
    const notification = await this.service.createMention(parsedInput);
    return notification.id;
  }

  @Mutation(() => Boolean, {
    description: 'mark notification as read',
  })
  async readNotification(
    @CurrentUser() me: UserType,
    @Args('id') notificationId: string
  ) {
    await this.service.markAsRead(me.id, notificationId);
    return true;
  }

  @Mutation(() => Boolean, {
    description: 'mark all notifications as read',
  })
  async readAllNotifications(@CurrentUser() me: UserType) {
    await this.service.markAllAsRead(me.id);
    return true;
  }
}

@Resolver(() => NotificationObjectType)
export class NotificationResolver {
  @ResolveField(() => UnionNotificationBodyType, {
    description:
      "Just a placeholder to export UnionNotificationBodyType, don't use it",
  })
  async _placeholderForUnionNotificationBodyType() {
    return null;
  }
}
