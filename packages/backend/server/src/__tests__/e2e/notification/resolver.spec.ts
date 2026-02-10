import { randomUUID } from 'node:crypto';

import {
  DocMode,
  listNotificationsQuery,
  MentionNotificationBodyType,
  mentionUserMutation,
  notificationCountQuery,
  NotificationObjectType,
  NotificationType,
  readAllNotificationsMutation,
  readNotificationMutation,
} from '@affine/graphql';

import { Mockers } from '../../mocks';
import { app, e2e } from '../test';

async function init() {
  const member = await app.create(Mockers.User);
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
    name: 'test-workspace-name',
    avatarKey: 'test-avatar-key',
  });

  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: member.id,
  });

  return {
    member,
    owner,
    workspace,
  };
}

e2e('should mention user in a doc', async t => {
  const { member, owner, workspace } = await init();

  await app.login(owner);
  const { mentionUser: mentionId } = await app.gql({
    query: mentionUserMutation,
    variables: {
      input: {
        userId: member.id,
        workspaceId: workspace.id,
        doc: {
          id: 'doc-id-1',
          title: 'doc-title-1',
          blockId: 'block-id-1',
          mode: DocMode.page,
        },
      },
    },
  });
  t.truthy(mentionId);
  // mention user at another doc
  const { mentionUser: mentionId2 } = await app.gql({
    query: mentionUserMutation,
    variables: {
      input: {
        userId: member.id,
        workspaceId: workspace.id,
        doc: {
          id: 'doc-id-2',
          title: 'doc-title-2',
          elementId: 'element-id-2',
          mode: DocMode.edgeless,
        },
      },
    },
  });
  t.truthy(mentionId2);

  await app.login(member);
  const result = await app.gql({
    query: listNotificationsQuery,
    variables: {
      pagination: {
        first: 10,
        offset: 0,
      },
    },
  });
  const notifications = result.currentUser!.notifications.edges.map(
    edge => edge.node
  );
  t.is(notifications.length, 2);

  const notification = notifications[1] as NotificationObjectType;
  t.is(notification.read, false);
  t.truthy(notification.createdAt);
  t.truthy(notification.updatedAt);
  const body = notification.body as MentionNotificationBodyType;
  t.is(body.workspace!.id, workspace.id);
  t.is(body.doc.id, 'doc-id-1');
  t.is(body.doc.title, 'doc-title-1');
  t.is(body.doc.blockId, 'block-id-1');
  t.is(body.doc.mode, DocMode.page);
  t.is(body.createdByUser!.id, owner.id);
  t.is(body.createdByUser!.name, owner.name);
  t.is(body.workspace!.id, workspace.id);
  t.is(body.workspace!.name, 'test-workspace-name');
  t.falsy(body.workspace!.avatarUrl);

  const notification2 = notifications[0] as NotificationObjectType;
  t.is(notification2.read, false);
  t.truthy(notification2.createdAt);
  t.truthy(notification2.updatedAt);
  const body2 = notification2.body as MentionNotificationBodyType;
  t.is(body2.workspace!.id, workspace.id);
  t.is(body2.doc.id, 'doc-id-2');
  t.is(body2.doc.title, 'doc-title-2');
  t.is(body2.doc.elementId, 'element-id-2');
  t.is(body2.doc.mode, DocMode.edgeless);
  t.is(body2.createdByUser!.id, owner.id);
  t.is(body2.workspace!.id, workspace.id);
  t.is(body2.workspace!.name, 'test-workspace-name');
  t.falsy(body2.workspace!.avatarUrl);
});

e2e('should mention doc mode support string value', async t => {
  const { member, owner, workspace } = await init();

  await app.login(owner);
  const { mentionUser: mentionId } = await app.gql({
    query: mentionUserMutation,
    variables: {
      input: {
        userId: member.id,
        workspaceId: workspace.id,
        doc: {
          id: 'doc-id-1',
          title: 'doc-title-1',
          blockId: 'block-id-1',
          mode: 'page' as DocMode,
        },
      },
    },
  });
  t.truthy(mentionId);
});

e2e('should throw error when mention user has no Doc.Read role', async t => {
  const { owner, workspace } = await init();
  const otherUser = await app.create(Mockers.User);

  await app.login(owner);
  const docId = randomUUID();
  await t.throwsAsync(
    app.gql({
      query: mentionUserMutation,
      variables: {
        input: {
          userId: otherUser.id,
          workspaceId: workspace.id,
          doc: {
            id: docId,
            title: 'doc-title-1',
            blockId: 'block-id-1',
            mode: DocMode.page,
          },
        },
      },
    }),
    {
      message: `Mentioned user can not access doc ${docId}.`,
    }
  );
});

e2e('should throw error when mention a not exists user', async t => {
  const { owner, workspace } = await init();

  await app.login(owner);
  const docId = randomUUID();
  await t.throwsAsync(
    app.gql({
      query: mentionUserMutation,
      variables: {
        input: {
          userId: 'user-id-not-exists',
          workspaceId: workspace.id,
          doc: {
            id: docId,
            title: 'doc-title-1',
            blockId: 'block-id-1',
            mode: DocMode.page,
          },
        },
      },
    }),
    {
      message: `Mentioned user can not access doc ${docId}.`,
    }
  );
});

e2e('should not mention user oneself', async t => {
  const { owner, workspace } = await init();

  await app.login(owner);
  await t.throwsAsync(
    app.gql({
      query: mentionUserMutation,
      variables: {
        input: {
          userId: owner.id,
          workspaceId: workspace.id,
          doc: {
            id: 'doc-id-1',
            title: 'doc-title-1',
            blockId: 'block-id-1',
            mode: DocMode.page,
          },
        },
      },
    }),
    {
      message: 'You can not mention yourself.',
    }
  );
});

e2e('should mark notification as read', async t => {
  const { member, owner, workspace } = await init();

  await app.login(owner);
  const { mentionUser: mentionId } = await app.gql({
    query: mentionUserMutation,
    variables: {
      input: {
        userId: member.id,
        workspaceId: workspace.id,
        doc: {
          id: 'doc-id-1',
          title: 'doc-title-1',
          blockId: 'block-id-1',
          mode: DocMode.page,
        },
      },
    },
  });
  t.truthy(mentionId);

  await app.login(member);
  const result = await app.gql({
    query: listNotificationsQuery,
    variables: {
      pagination: {
        first: 10,
        offset: 0,
      },
    },
  });
  t.truthy(mentionId);

  const notifications = result.currentUser!.notifications.edges.map(
    edge => edge.node
  );

  for (const notification of notifications) {
    t.is(notification.read, false);
    await app.gql({
      query: readNotificationMutation,
      variables: {
        id: notification.id,
      },
    });
  }
  const count = await app.gql({
    query: notificationCountQuery,
  });
  t.is(count.currentUser!.notifications.totalCount, 0);

  // read again should work
  for (const notification of notifications) {
    t.is(notification.read, false);
    await app.gql({
      query: readNotificationMutation,
      variables: {
        id: notification.id,
      },
    });
  }
});

e2e('should throw error when read the other user notification', async t => {
  const { member, owner, workspace } = await init();

  await app.login(owner);
  const { mentionUser: mentionId } = await app.gql({
    query: mentionUserMutation,
    variables: {
      input: {
        userId: member.id,
        workspaceId: workspace.id,
        doc: {
          id: 'doc-id-1',
          title: 'doc-title-1',
          blockId: 'block-id-1',
          mode: DocMode.page,
        },
      },
    },
  });
  t.truthy(mentionId);

  await app.login(member);
  const result = await app.gql({
    query: listNotificationsQuery,
    variables: {
      pagination: {
        first: 10,
        offset: 0,
      },
    },
  });
  const notifications = result.currentUser!.notifications.edges.map(
    edge => edge.node
  );
  t.is(notifications[0].read, false);

  await app.login(owner);
  await t.throwsAsync(
    app.gql({
      query: readNotificationMutation,
      variables: {
        id: notifications[0].id,
      },
    }),
    {
      message: 'Notification not found.',
    }
  );
  // notification not exists
  await t.throwsAsync(
    app.gql({
      query: readNotificationMutation,
      variables: {
        id: 'notification-id-not-exists',
      },
    }),
    {
      message: 'Notification not found.',
    }
  );
});

e2e('should throw error when mention call with invalid params', async t => {
  await app.signup();
  await t.throwsAsync(
    app.gql({
      query: mentionUserMutation,
      variables: {
        input: {
          userId: '1',
          workspaceId: '1',
          doc: {
            id: '1',
            title: 'doc-title-1'.repeat(100),
            blockId: '1',
            mode: DocMode.page,
          },
        },
      },
    }),
    {
      message: /Validation error/,
    }
  );
});

e2e('should throw error when mention mode value is invalid', async t => {
  await app.signup();
  await t.throwsAsync(
    app.gql({
      query: mentionUserMutation,
      variables: {
        input: {
          userId: randomUUID(),
          workspaceId: randomUUID(),
          doc: {
            id: randomUUID(),
            title: 'doc-title-1',
            blockId: 'block-id-1',
            mode: 'invalid-mode' as DocMode,
          },
        },
      },
    }),
    {
      message:
        'Variable "$input" got invalid value "invalid-mode" at "input.doc.mode"; Value "invalid-mode" does not exist in "DocMode" enum.',
    }
  );
});

e2e('should get empty notifications', async t => {
  await app.signup();
  const result = await app.gql({
    query: listNotificationsQuery,
    variables: {
      pagination: {
        first: 10,
        offset: 0,
      },
    },
  });
  const notifications = result.currentUser!.notifications.edges.map(
    edge => edge.node
  );
  t.is(notifications.length, 0);
  t.is(result.currentUser!.notifications.totalCount, 0);
});

e2e('should list and count notifications', async t => {
  const { member, owner, workspace } = await init();
  await app.login(owner);
  await app.gql({
    query: mentionUserMutation,
    variables: {
      input: {
        userId: member.id,
        workspaceId: workspace.id,
        doc: {
          id: 'doc-id-1',
          title: 'doc-title-1',
          blockId: 'block-id-1',
          mode: DocMode.page,
        },
      },
    },
  });
  await app.gql({
    query: mentionUserMutation,
    variables: {
      input: {
        userId: member.id,
        workspaceId: workspace.id,
        doc: {
          id: 'doc-id-2',
          title: 'doc-title-2',
          blockId: 'block-id-2',
          mode: DocMode.page,
        },
      },
    },
  });
  await app.gql({
    query: mentionUserMutation,
    variables: {
      input: {
        userId: member.id,
        workspaceId: workspace.id,
        doc: {
          id: 'doc-id-3',
          title: 'doc-title-3',
          blockId: 'block-id-3',
          mode: DocMode.page,
        },
      },
    },
  });
  // mention user in another workspace
  const workspace2 = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
    name: 'test-workspace-name2',
    avatarKey: 'test-avatar-key2',
  });
  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace2.id,
    userId: member.id,
  });
  await app.gql({
    query: mentionUserMutation,
    variables: {
      input: {
        userId: member.id,
        workspaceId: workspace2.id,
        doc: {
          id: 'doc-id-4',
          title: 'doc-title-4',
          blockId: 'block-id-4',
          mode: DocMode.page,
        },
      },
    },
  });

  {
    await app.login(member);
    const result = await app.gql({
      query: listNotificationsQuery,
      variables: {
        pagination: {
          first: 10,
          offset: 0,
        },
      },
    });
    const notifications = result.currentUser!.notifications.edges.map(
      edge => edge.node
    ) as NotificationObjectType[];
    t.is(notifications.length, 4);
    t.is(result.currentUser!.notifications.totalCount, 4);

    const notification = notifications[0];
    t.is(notification.read, false);
    const body = notification.body as MentionNotificationBodyType;
    t.is(body.type, NotificationType.Mention);
    t.is(body.workspace!.name, 'test-workspace-name2');
    t.is(body.workspace!.id, workspace2.id);
    t.falsy(body.workspace!.avatarUrl);
    t.is(body.doc.id, 'doc-id-4');
    t.is(body.doc.title, 'doc-title-4');
    t.is(body.doc.blockId, 'block-id-4');
    t.is(body.createdByUser!.id, owner.id);

    const notification2 = notifications[1];
    t.is(notification2.read, false);
    const body2 = notification2.body as MentionNotificationBodyType;
    t.is(body2.type, NotificationType.Mention);
    t.is(body2.workspace!.id, workspace.id);
    t.is(body2.doc.id, 'doc-id-3');
    t.is(body2.doc.title, 'doc-title-3');
    t.is(body2.doc.blockId, 'block-id-3');
    t.is(body2.createdByUser!.id, owner.id);
    t.is(body2.workspace!.id, workspace.id);
    t.is(body2.workspace!.name, 'test-workspace-name');
    t.falsy(body2.workspace!.avatarUrl);
  }

  {
    await app.login(member);
    const result = await app.gql({
      query: listNotificationsQuery,
      variables: {
        pagination: {
          first: 10,
          offset: 2,
        },
      },
    });
    t.is(result.currentUser!.notifications.totalCount, 4);
    t.is(result.currentUser!.notifications.pageInfo.hasNextPage, false);
    t.is(result.currentUser!.notifications.pageInfo.hasPreviousPage, true);
    const notifications = result.currentUser!.notifications.edges.map(
      edge => edge.node
    ) as NotificationObjectType[];
    t.is(notifications.length, 2);

    const notification = notifications[0];
    t.is(notification.read, false);
    const body = notification.body as MentionNotificationBodyType;
    t.is(body.workspace!.id, workspace.id);
    t.is(body.doc.id, 'doc-id-2');
    t.is(body.doc.title, 'doc-title-2');
    t.is(body.doc.blockId, 'block-id-2');
    t.is(body.createdByUser!.id, owner.id);
    t.is(body.workspace!.id, workspace.id);
    t.is(body.workspace!.name, 'test-workspace-name');
    t.falsy(body.workspace!.avatarUrl);

    const notification2 = notifications[1];
    t.is(notification2.read, false);
    const body2 = notification2.body as MentionNotificationBodyType;
    t.is(body2.workspace!.id, workspace.id);
    t.is(body2.doc.id, 'doc-id-1');
    t.is(body2.doc.title, 'doc-title-1');
    t.is(body2.doc.blockId, 'block-id-1');
    t.is(body2.createdByUser!.id, owner.id);
    t.is(body2.workspace!.id, workspace.id);
    t.is(body2.workspace!.name, 'test-workspace-name');
    t.falsy(body2.workspace!.avatarUrl);
  }

  {
    await app.login(member);
    const result = await app.gql({
      query: listNotificationsQuery,
      variables: {
        pagination: {
          first: 2,
          offset: 0,
        },
      },
    });
    t.is(result.currentUser!.notifications.totalCount, 4);
    t.is(result.currentUser!.notifications.pageInfo.hasNextPage, true);
    t.is(result.currentUser!.notifications.pageInfo.hasPreviousPage, false);
    const notifications = result.currentUser!.notifications.edges.map(
      edge => edge.node
    ) as NotificationObjectType[];
    t.is(notifications.length, 2);

    const notification = notifications[0];
    t.is(notification.read, false);
    const body = notification.body as MentionNotificationBodyType;
    t.is(body.workspace!.id, workspace2.id);
    t.is(body.doc.id, 'doc-id-4');
    t.is(body.doc.title, 'doc-title-4');
    t.is(body.doc.blockId, 'block-id-4');
    t.is(body.createdByUser!.id, owner.id);
    t.is(body.workspace!.id, workspace2.id);
    t.is(body.workspace!.name, 'test-workspace-name2');
    t.falsy(body.workspace!.avatarUrl);
    t.is(
      notification.createdAt.toString(),
      Buffer.from(
        result.currentUser!.notifications.pageInfo.startCursor!,
        'base64'
      ).toString('utf-8')
    );
    const notification2 = notifications[1];
    t.is(notification2.read, false);
    const body2 = notification2.body as MentionNotificationBodyType;
    t.is(body2.workspace!.id, workspace.id);
    t.is(body2.doc.id, 'doc-id-3');
    t.is(body2.doc.title, 'doc-title-3');
    t.is(body2.doc.blockId, 'block-id-3');
    t.is(body2.createdByUser!.id, owner.id);
    t.is(body2.workspace!.id, workspace.id);
    t.is(body2.workspace!.name, 'test-workspace-name');
    t.falsy(body2.workspace!.avatarUrl);

    // load more notifications
    await app.login(member);
    const result2 = await app.gql({
      query: listNotificationsQuery,
      variables: {
        pagination: {
          first: 2,
          offset: 0,
          after: result.currentUser!.notifications.pageInfo.endCursor,
        },
      },
    });
    t.is(result2.currentUser!.notifications.totalCount, 4);
    t.is(result2.currentUser!.notifications.pageInfo.hasNextPage, true);
    t.is(result2.currentUser!.notifications.pageInfo.hasPreviousPage, true);
    const notifications2 = result2.currentUser!.notifications.edges.map(
      edge => edge.node
    ) as NotificationObjectType[];
    t.is(notifications2.length, 2);

    const notification3 = notifications2[0];
    t.is(notification3.read, false);
    const body3 = notification3.body as MentionNotificationBodyType;
    t.is(body3.workspace!.id, workspace.id);
    t.is(body3.doc.id, 'doc-id-2');
    t.is(body3.doc.title, 'doc-title-2');
    t.is(body3.doc.blockId, 'block-id-2');
    t.is(body3.createdByUser!.id, owner.id);
    t.is(body3.createdByUser!.name, owner.name);
    t.is(body3.workspace!.id, workspace.id);
    t.is(body3.workspace!.name, 'test-workspace-name');
    t.falsy(body3.workspace!.avatarUrl);

    // no notifications
    const result3 = await app.gql({
      query: listNotificationsQuery,
      variables: {
        pagination: {
          first: 2,
          offset: 0,
          after: result2.currentUser!.notifications.pageInfo.endCursor,
        },
      },
    });
    t.is(result3.currentUser!.notifications.totalCount, 4);
    t.is(result3.currentUser!.notifications.pageInfo.hasNextPage, false);
    t.is(result3.currentUser!.notifications.pageInfo.hasPreviousPage, true);
    t.is(result3.currentUser!.notifications.pageInfo.startCursor, null);
    t.is(result3.currentUser!.notifications.pageInfo.endCursor, null);
    t.is(result3.currentUser!.notifications.edges.length, 0);
  }
});

e2e('should mark all notifications as read', async t => {
  const { member, owner, workspace } = await init();
  await app.login(owner);

  await app.gql({
    query: mentionUserMutation,
    variables: {
      input: {
        userId: member.id,
        workspaceId: workspace.id,
        doc: {
          id: 'doc-id-1',
          title: 'doc-title-1',
          blockId: 'block-id-1',
          mode: DocMode.page,
        },
      },
    },
  });

  await app.login(member);

  await app.gql({
    query: readAllNotificationsMutation,
  });

  const result = await app.gql({
    query: listNotificationsQuery,
    variables: {
      pagination: {
        first: 10,
        offset: 0,
      },
    },
  });
  t.is(result.currentUser!.notifications.totalCount, 0);
});
