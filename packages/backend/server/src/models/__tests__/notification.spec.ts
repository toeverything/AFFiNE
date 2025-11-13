import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';

import test from 'ava';

import { createModule } from '../../__tests__/create-module';
import { Mockers } from '../../__tests__/mocks';
import { Due } from '../../base';
import {
  DocMode,
  Models,
  NotificationLevel,
  NotificationType,
  User,
  Workspace,
} from '../../models';

const module = await createModule();
const models = module.get(Models);
let user: User;
let createdBy: User;
let workspace: Workspace;
let docId: string;

test.beforeEach(async () => {
  user = await module.create(Mockers.User);
  createdBy = await module.create(Mockers.User);
  workspace = await module.create(Mockers.Workspace);
  docId = randomUUID();
  await models.doc.upsert({
    spaceId: user.id,
    docId,
    blob: Buffer.from('hello'),
    timestamp: Date.now(),
    editorId: user.id,
  });
});

test.afterEach.always(() => {
  mock.reset();
  mock.timers.reset();
});

test.after.always(async () => {
  await module.close();
});

test('should create a mention notification with default level', async t => {
  const notification = await models.notification.createMention({
    userId: user.id,
    body: {
      workspaceId: workspace.id,
      doc: {
        id: docId,
        title: 'doc-title',
        blockId: 'blockId',
        mode: DocMode.page,
      },
      createdByUserId: createdBy.id,
    },
  });
  t.is(notification.level, NotificationLevel.Default);
  t.is(notification.body.workspaceId, workspace.id);
  t.is(notification.body.doc.id, docId);
  t.is(notification.body.doc.title, 'doc-title');
  t.is(notification.body.doc.blockId, 'blockId');
  t.is(notification.body.createdByUserId, createdBy.id);
  t.is(notification.type, NotificationType.Mention);
  t.is(notification.read, false);
});

test('should create a mention notification with custom level', async t => {
  const notification = await models.notification.createMention({
    userId: user.id,
    body: {
      workspaceId: workspace.id,
      doc: {
        id: docId,
        title: 'doc-title',
        elementId: 'elementId',
        mode: DocMode.page,
      },
      createdByUserId: createdBy.id,
    },
    level: NotificationLevel.High,
  });
  t.is(notification.level, NotificationLevel.High);
  t.is(notification.body.workspaceId, workspace.id);
  t.is(notification.body.doc.id, docId);
  t.is(notification.body.doc.title, 'doc-title');
  t.is(notification.body.doc.elementId, 'elementId');
  t.is(notification.body.createdByUserId, createdBy.id);
  t.is(notification.type, NotificationType.Mention);
  t.is(notification.read, false);
});

test('should mark a mention notification as read', async t => {
  const notification = await models.notification.createMention({
    userId: user.id,
    body: {
      workspaceId: workspace.id,
      doc: {
        id: docId,
        title: 'doc-title',
        blockId: 'blockId',
        mode: DocMode.page,
      },
      createdByUserId: createdBy.id,
    },
  });
  t.is(notification.read, false);
  await models.notification.markAsRead(notification.id, user.id);
  const updatedNotification = await models.notification.get(notification.id);
  t.is(updatedNotification!.read, true);
});

test('should create an invite notification', async t => {
  const inviteId = randomUUID();
  const notification = await models.notification.createInvitation({
    userId: user.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: createdBy.id,
      inviteId,
    },
  });
  t.is(notification.type, NotificationType.Invitation);
  t.is(notification.body.workspaceId, workspace.id);
  t.is(notification.body.createdByUserId, createdBy.id);
  t.is(notification.body.inviteId, inviteId);
  t.is(notification.read, false);
});

test('should mark an invite notification as read', async t => {
  const inviteId = randomUUID();
  const notification = await models.notification.createInvitation({
    userId: user.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: createdBy.id,
      inviteId,
    },
  });
  t.is(notification.read, false);
  await models.notification.markAsRead(notification.id, user.id);
  const updatedNotification = await models.notification.get(notification.id);
  t.is(updatedNotification!.read, true);
});

test('should find many notifications by user id, order by createdAt descending', async t => {
  const notification1 = await models.notification.createMention({
    userId: user.id,
    body: {
      workspaceId: workspace.id,
      doc: {
        id: docId,
        title: 'doc-title',
        blockId: 'blockId',
        mode: DocMode.page,
      },
      createdByUserId: createdBy.id,
    },
  });
  const inviteId = randomUUID();
  const notification2 = await models.notification.createInvitation({
    userId: user.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: createdBy.id,
      inviteId,
    },
  });
  const notifications = await models.notification.findManyByUserId(user.id);
  t.is(notifications.length, 2);
  t.is(notifications[0].id, notification2.id);
  t.is(notifications[1].id, notification1.id);
});

test('should find many notifications by user id, filter read notifications', async t => {
  const notification1 = await models.notification.createMention({
    userId: user.id,
    body: {
      workspaceId: workspace.id,
      doc: {
        id: docId,
        title: 'doc-title',
        blockId: 'blockId',
        mode: DocMode.page,
      },
      createdByUserId: createdBy.id,
    },
  });
  const inviteId = randomUUID();
  const notification2 = await models.notification.createInvitation({
    userId: user.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: createdBy.id,
      inviteId,
    },
  });
  await models.notification.markAsRead(notification2.id, user.id);
  const notifications = await models.notification.findManyByUserId(user.id);
  t.is(notifications.length, 1);
  t.is(notifications[0].id, notification1.id);
});

test('should clean expired notifications', async t => {
  const notification = await models.notification.createMention({
    userId: user.id,
    body: {
      workspaceId: workspace.id,
      doc: {
        id: docId,
        title: 'doc-title',
        blockId: 'blockId',
        mode: DocMode.page,
      },
      createdByUserId: createdBy.id,
    },
  });
  t.truthy(notification);
  let notifications = await models.notification.findManyByUserId(user.id);
  t.is(notifications.length, 1);
  let count = await models.notification.cleanExpiredNotifications();
  t.is(count, 0);
  notifications = await models.notification.findManyByUserId(user.id);
  t.is(notifications.length, 1);
  t.is(notifications[0].id, notification.id);

  await models.notification.markAsRead(notification.id, user.id);
  // wait for 1 year
  mock.timers.enable({
    apis: ['Date'],
    now: Due.after('1y'),
  });
  count = await models.notification.cleanExpiredNotifications();
  t.true(count > 0);
  notifications = await models.notification.findManyByUserId(user.id);
  t.is(notifications.length, 0);
});

test('should not clean unexpired notifications', async t => {
  const notification = await models.notification.createMention({
    userId: user.id,
    body: {
      workspaceId: workspace.id,
      doc: {
        id: docId,
        title: 'doc-title',
        blockId: 'blockId',
        mode: DocMode.page,
      },
      createdByUserId: createdBy.id,
    },
  });
  let count = await models.notification.cleanExpiredNotifications();
  t.is(count, 0);
  await models.notification.markAsRead(notification.id, user.id);
  count = await models.notification.cleanExpiredNotifications();
  t.is(count, 0);
});

test('should find many notifications by user id, order by createdAt descending, with pagination', async t => {
  const notification1 = await models.notification.createMention({
    userId: user.id,
    body: {
      workspaceId: workspace.id,
      doc: {
        id: docId,
        title: 'doc-title',
        blockId: 'blockId',
        mode: DocMode.edgeless,
      },
      createdByUserId: createdBy.id,
    },
  });
  const notification2 = await models.notification.createInvitation({
    userId: user.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: createdBy.id,
      inviteId: randomUUID(),
    },
  });
  const notification3 = await models.notification.createInvitation({
    userId: user.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: createdBy.id,
      inviteId: randomUUID(),
    },
  });
  const notification4 = await models.notification.createInvitation({
    userId: user.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: createdBy.id,
      inviteId: randomUUID(),
    },
  });
  const notifications = await models.notification.findManyByUserId(user.id, {
    offset: 0,
    first: 2,
  });
  t.is(notifications.length, 2);
  t.is(notifications[0].id, notification4.id);
  t.is(notifications[1].id, notification3.id);
  const notifications2 = await models.notification.findManyByUserId(user.id, {
    offset: 2,
    first: 2,
  });
  t.is(notifications2.length, 2);
  t.is(notifications2[0].id, notification2.id);
  t.is(notifications2[1].id, notification1.id);
  const notifications3 = await models.notification.findManyByUserId(user.id, {
    offset: 4,
    first: 2,
  });
  t.is(notifications3.length, 0);
});

test('should count notifications by user id, exclude read notifications', async t => {
  const notification1 = await models.notification.createMention({
    userId: user.id,
    body: {
      workspaceId: workspace.id,
      doc: {
        id: docId,
        title: 'doc-title',
        blockId: 'blockId',
        mode: DocMode.page,
      },
      createdByUserId: createdBy.id,
    },
  });
  t.truthy(notification1);
  const notification2 = await models.notification.createInvitation({
    userId: user.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: createdBy.id,
      inviteId: randomUUID(),
    },
  });
  t.truthy(notification2);
  await models.notification.markAsRead(notification2.id, user.id);
  const count = await models.notification.countByUserId(user.id);
  t.is(count, 1);
});

test('should count notifications by user id, include read notifications', async t => {
  const notification1 = await models.notification.createMention({
    userId: user.id,
    body: {
      workspaceId: workspace.id,
      doc: {
        id: docId,
        title: 'doc-title',
        blockId: 'blockId',
        mode: DocMode.page,
      },
      createdByUserId: createdBy.id,
    },
  });
  t.truthy(notification1);
  const notification2 = await models.notification.createInvitation({
    userId: user.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: createdBy.id,
      inviteId: randomUUID(),
    },
  });
  t.truthy(notification2);
  await models.notification.markAsRead(notification2.id, user.id);
  const count = await models.notification.countByUserId(user.id, {
    includeRead: true,
  });
  t.is(count, 2);
});

test('should create a comment notification', async t => {
  const commentId = randomUUID();

  const notification = await models.notification.createComment({
    userId: user.id,
    body: {
      workspaceId: workspace.id,
      doc: {
        id: docId,
        title: 'doc-title',
        mode: DocMode.page,
      },
      createdByUserId: createdBy.id,
      commentId,
    },
  });

  t.is(notification.type, NotificationType.Comment);
  t.is(notification.body.workspaceId, workspace.id);
  t.is(notification.body.doc.id, docId);
  t.is(notification.body.doc.title, 'doc-title');
  t.is(notification.body.commentId, commentId);
});

test('should create a comment mention notification', async t => {
  const commentId = randomUUID();
  const replyId = randomUUID();

  const notification = await models.notification.createCommentMention({
    userId: user.id,
    body: {
      workspaceId: workspace.id,
      doc: {
        id: docId,
        title: 'doc-title',
        mode: DocMode.page,
      },
      createdByUserId: createdBy.id,
      commentId,
      replyId,
    },
  });

  t.is(notification.type, NotificationType.CommentMention);
  t.is(notification.body.workspaceId, workspace.id);
  t.is(notification.body.doc.id, docId);
  t.is(notification.body.doc.title, 'doc-title');
  t.is(notification.body.commentId, commentId);
  t.is(notification.body.replyId, replyId);
});

test('should mark all notifications as read', async t => {
  await models.notification.createMention({
    userId: user.id,
    body: {
      workspaceId: workspace.id,
      doc: {
        id: docId,
        title: 'doc-title',
        blockId: 'blockId',
        mode: DocMode.page,
      },
      createdByUserId: createdBy.id,
    },
  });
  await models.notification.createInvitation({
    userId: user.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: createdBy.id,
      inviteId: randomUUID(),
    },
  });

  await models.notification.markAllAsRead(user.id);

  const notifications = await models.notification.findManyByUserId(user.id);
  t.is(notifications.length, 0);
});
