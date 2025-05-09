import { PaginationInput } from '../../base/graphql/pagination';
import type {
  MentionInput,
  PaginatedNotificationObjectType,
} from '../../core/notification/types';
import type { TestingApp } from './testing-app';

export async function listNotifications(
  app: TestingApp,
  pagination: PaginationInput
): Promise<PaginatedNotificationObjectType> {
  const res = await app.gql(
    `
    query listNotifications($pagination: PaginationInput!) {
      currentUser {
        notifications(pagination: $pagination) {
          totalCount
          edges {
            cursor
            node {
              id
              type
              level
              read
              createdAt
              updatedAt
              body
            }
          }
          pageInfo {
            startCursor
            endCursor
            hasNextPage
            hasPreviousPage
          }
        }
      }
    }
    `,
    { pagination }
  );
  return res.currentUser.notifications;
}

export async function getNotificationCount(app: TestingApp): Promise<number> {
  const res = await app.gql(
    `
    query notificationCount {
      currentUser {
        notificationCount
      }
    }
    `
  );
  return res.currentUser.notificationCount;
}

export async function mentionUser(
  app: TestingApp,
  input: MentionInput
): Promise<string> {
  const res = await app.gql(
    `
    mutation mentionUser($input: MentionInput!) {
      mentionUser(input: $input)
    }
    `,
    { input }
  );
  return res.mentionUser;
}

export async function readNotification(
  app: TestingApp,
  id: string
): Promise<boolean> {
  const res = await app.gql(
    `
    mutation readNotification($id: String!) {
      readNotification(id: $id)
    }
    `,
    { id }
  );
  return res.readNotification;
}
