import {
  type DocMode,
  type ListNotificationsQuery,
  listNotificationsQuery,
  mentionUserMutation,
  notificationCountQuery,
  type PaginationInput,
  readAllNotificationsMutation,
  readNotificationMutation,
  type UnionNotificationBodyType,
} from '@affine/graphql';
import { Store } from '@toeverything/infra';
import { map } from 'rxjs';

import type { GraphQLService, ServerService } from '../../cloud';
import type { GlobalSessionState } from '../../storage';

export type Notification = NonNullable<
  ListNotificationsQuery['currentUser']
>['notifications']['edges'][number]['node'];

export type NotificationBody = UnionNotificationBodyType;

export { NotificationType } from '@affine/graphql';

export class NotificationStore extends Store {
  constructor(
    private readonly gqlService: GraphQLService,
    private readonly serverService: ServerService,
    private readonly globalSessionState: GlobalSessionState
  ) {
    super();
  }

  watchNotificationCountCache() {
    return this.globalSessionState
      .watch('notification-count:' + this.serverService.server.id)
      .pipe(
        map(count => {
          if (typeof count === 'number') {
            return count;
          }
          return 0;
        })
      );
  }

  setNotificationCountCache(count: number) {
    this.globalSessionState.set(
      'notification-count:' + this.serverService.server.id,
      count
    );
  }

  async getNotificationCount(signal?: AbortSignal) {
    const result = await this.gqlService.gql({
      query: notificationCountQuery,
      context: {
        signal,
      },
    });

    return result.currentUser?.notifications.totalCount;
  }

  async listNotification(pagination: PaginationInput, signal?: AbortSignal) {
    const result = await this.gqlService.gql({
      query: listNotificationsQuery,
      variables: {
        pagination: pagination,
      },
      context: {
        signal,
      },
    });

    return result.currentUser?.notifications;
  }

  readNotification(id: string) {
    return this.gqlService.gql({
      query: readNotificationMutation,
      variables: {
        id,
      },
    });
  }

  readAllNotifications() {
    return this.gqlService.gql({
      query: readAllNotificationsMutation,
    });
  }

  async mentionUser(
    userId: string,
    workspaceId: string,
    doc: {
      id: string;
      title: string;
      blockId?: string;
      elementId?: string;
      mode: DocMode;
    }
  ) {
    const result = await this.gqlService.gql({
      query: mentionUserMutation,
      variables: {
        input: {
          userId,
          workspaceId,
          doc,
        },
      },
    });
    return result.mentionUser;
  }
}
