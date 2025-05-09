import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';

import ava, { TestFn } from 'ava';

import { Mockers } from '../../../__tests__/mocks';
import {
  createTestingModule,
  type TestingModule,
} from '../../../__tests__/utils';
import { NotificationNotFound } from '../../../base';
import {
  DocMode,
  MentionNotificationBody,
  Models,
  NotificationType,
  User,
  Workspace,
  WorkspaceMemberStatus,
} from '../../../models';
import { DocReader } from '../../doc';
import { NotificationService } from '../service';

interface Context {
  module: TestingModule;
  notificationService: NotificationService;
  models: Models;
  docReader: DocReader;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule();
  t.context.module = module;
  t.context.notificationService = module.get(NotificationService);
  t.context.models = module.get(Models);
  t.context.docReader = module.get(DocReader);
});

let owner: User;
let member: User;
let workspace: Workspace;

test.beforeEach(async t => {
  const { module } = t.context;
  await module.initTestingDB();
  owner = await module.create(Mockers.User);
  member = await module.create(Mockers.User);
  workspace = await module.create(Mockers.Workspace, {
    owner: {
      id: owner.id,
    },
    name: 'Test Workspace',
    avatarKey: 'test-avatar-key',
  });
});

test.afterEach.always(() => {
  mock.reset();
  mock.timers.reset();
});

test.after.always(async t => {
  await t.context.module.close();
});

test('should create invitation notification and email', async t => {
  const { notificationService } = t.context;
  const inviteId = randomUUID();
  const notification = await notificationService.createInvitation({
    userId: member.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: owner.id,
      inviteId,
    },
  });
  t.truthy(notification);
  t.is(notification!.type, NotificationType.Invitation);
  t.is(notification!.userId, member.id);
  t.is(notification!.body.workspaceId, workspace.id);
  t.is(notification!.body.createdByUserId, owner.id);
  t.is(notification!.body.inviteId, inviteId);
  // should send invitation email
  const invitationMail = t.context.module.mails.last('MemberInvitation');
  t.is(invitationMail.to, member.email);
});

test('should not send invitation email if user setting is not to receive invitation email', async t => {
  const { notificationService, module } = t.context;
  const inviteId = randomUUID();
  await module.create(Mockers.UserSettings, {
    userId: member.id,
    receiveInvitationEmail: false,
  });
  const invitationMailCount = module.mails.count('MemberInvitation');
  const notification = await notificationService.createInvitation({
    userId: member.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: owner.id,
      inviteId,
    },
  });
  t.truthy(notification);
  // no new invitation email should be sent
  t.is(t.context.module.mails.count('MemberInvitation'), invitationMailCount);
});

test('should not create invitation notification if user is already a member', async t => {
  const { notificationService, module } = t.context;
  const { id: inviteId } = await module.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: member.id,
  });
  const notification = await notificationService.createInvitation({
    userId: member.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: owner.id,
      inviteId,
    },
  });
  t.is(notification, undefined);
});

test('should create invitation accepted notification and email', async t => {
  const { notificationService, module } = t.context;
  const { id: inviteId } = await module.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: member.id,
  });
  const notification = await notificationService.createInvitationAccepted({
    userId: owner.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: member.id,
      inviteId,
    },
  });
  t.truthy(notification);
  t.is(notification!.type, NotificationType.InvitationAccepted);
  t.is(notification!.userId, owner.id);
  t.is(notification!.body.workspaceId, workspace.id);
  t.is(notification!.body.createdByUserId, member.id);
  t.is(notification!.body.inviteId, inviteId);

  // should send email
  const invitationAcceptedMail = module.mails.last('MemberAccepted');
  t.is(invitationAcceptedMail.to, owner.email);
});

test('should not send invitation accepted email if user settings is not receive invitation email', async t => {
  const { notificationService, module } = t.context;
  const { id: inviteId } = await module.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: member.id,
  });
  // should not send email if user settings is not receive invitation email
  await module.create(Mockers.UserSettings, {
    userId: owner.id,
    receiveInvitationEmail: false,
  });
  const invitationAcceptedMailCount =
    t.context.module.mails.count('MemberAccepted');
  const notification = await notificationService.createInvitationAccepted({
    userId: owner.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: member.id,
      inviteId,
    },
  });
  t.truthy(notification);
  // no new invitation accepted email should be sent
  t.is(
    t.context.module.mails.count('MemberAccepted'),
    invitationAcceptedMailCount
  );
});

test('should not create invitation accepted notification if user is not an active member', async t => {
  const { notificationService } = t.context;
  const inviteId = randomUUID();
  const notification = await notificationService.createInvitationAccepted({
    userId: owner.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: member.id,
      inviteId,
    },
  });
  t.is(notification, undefined);
});

test('should create invitation blocked notification', async t => {
  const { notificationService } = t.context;
  const inviteId = randomUUID();
  const notification = await notificationService.createInvitationBlocked({
    userId: owner.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: member.id,
      inviteId,
    },
  });
  t.truthy(notification);
  t.is(notification!.type, NotificationType.InvitationBlocked);
  t.is(notification!.userId, owner.id);
  t.is(notification!.body.workspaceId, workspace.id);
  t.is(notification!.body.createdByUserId, member.id);
  t.is(notification!.body.inviteId, inviteId);
});

test('should create invitation rejected notification', async t => {
  const { notificationService } = t.context;
  const inviteId = randomUUID();
  const notification = await notificationService.createInvitationRejected({
    userId: owner.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: member.id,
      inviteId,
    },
  });
  t.truthy(notification);
  t.is(notification!.type, NotificationType.InvitationRejected);
  t.is(notification!.userId, owner.id);
  t.is(notification!.body.workspaceId, workspace.id);
  t.is(notification!.body.createdByUserId, member.id);
  t.is(notification!.body.inviteId, inviteId);
});

test('should create invitation review request notification if user is not an active member', async t => {
  const { notificationService, module } = t.context;
  const inviteId = randomUUID();
  const notification = await notificationService.createInvitationReviewRequest({
    userId: owner.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: member.id,
      inviteId,
    },
  });
  t.truthy(notification);
  t.is(notification!.type, NotificationType.InvitationReviewRequest);
  t.is(notification!.userId, owner.id);
  t.is(notification!.body.workspaceId, workspace.id);
  t.is(notification!.body.createdByUserId, member.id);
  t.is(notification!.body.inviteId, inviteId);

  // should send email
  const invitationReviewRequestMail = module.mails.last(
    'LinkInvitationReviewRequest'
  );
  t.is(invitationReviewRequestMail.to, owner.email);
});

test('should not create invitation review request notification if user is an active member', async t => {
  const { notificationService, module } = t.context;
  const { id: inviteId } = await module.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: member.id,
  });
  const notification = await notificationService.createInvitationReviewRequest({
    userId: owner.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: member.id,
      inviteId,
    },
  });
  t.is(notification, undefined);
});

test('should create invitation review approved notification if user is an active member', async t => {
  const { notificationService, module } = t.context;
  const { id: inviteId } = await module.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: member.id,
  });
  const notification = await notificationService.createInvitationReviewApproved(
    {
      userId: member.id,
      body: {
        workspaceId: workspace.id,
        createdByUserId: owner.id,
        inviteId,
      },
    }
  );
  t.truthy(notification);
  t.is(notification!.type, NotificationType.InvitationReviewApproved);
  t.is(notification!.userId, member.id);
  t.is(notification!.body.workspaceId, workspace.id);
  t.is(notification!.body.createdByUserId, owner.id);
  t.is(notification!.body.inviteId, inviteId);

  // should send email
  const invitationReviewApprovedMail = t.context.module.mails.last(
    'LinkInvitationApprove'
  );
  t.is(invitationReviewApprovedMail.to, member.email);
});

test('should not create invitation review approved notification if user is not an active member', async t => {
  const { notificationService, module } = t.context;
  const { id: inviteId } = await module.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: member.id,
    status: WorkspaceMemberStatus.Pending,
  });
  const notification = await notificationService.createInvitationReviewApproved(
    {
      userId: member.id,
      body: {
        workspaceId: workspace.id,
        createdByUserId: owner.id,
        inviteId,
      },
    }
  );
  t.is(notification, undefined);
});

test('should create invitation review declined notification if user is not an active member', async t => {
  const { notificationService, module } = t.context;
  const notification = await notificationService.createInvitationReviewDeclined(
    {
      userId: member.id,
      body: {
        workspaceId: workspace.id,
        createdByUserId: owner.id,
      },
    }
  );
  t.truthy(notification);
  t.is(notification!.type, NotificationType.InvitationReviewDeclined);
  t.is(notification!.userId, member.id);
  t.is(notification!.body.workspaceId, workspace.id);
  t.is(notification!.body.createdByUserId, owner.id);

  // should send email
  const invitationReviewDeclinedMail = module.mails.last(
    'LinkInvitationDecline'
  );
  t.is(invitationReviewDeclinedMail.to, member.email);
});

test('should not create invitation review declined notification if user is an active member', async t => {
  const { notificationService, module } = t.context;
  await module.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: member.id,
  });
  const notification = await notificationService.createInvitationReviewDeclined(
    {
      userId: owner.id,
      body: {
        workspaceId: workspace.id,
        createdByUserId: member.id,
      },
    }
  );
  t.is(notification, undefined);
});

test('should clean expired notifications', async t => {
  const { notificationService } = t.context;
  await notificationService.createInvitation({
    userId: member.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: owner.id,
      inviteId: randomUUID(),
    },
  });
  let count = await notificationService.countByUserId(member.id);
  t.is(count, 1);
  // wait for 100 days
  mock.timers.enable({
    apis: ['Date'],
    now: Date.now() + 1000 * 60 * 60 * 24 * 100,
  });
  await t.context.models.notification.cleanExpiredNotifications();
  count = await notificationService.countByUserId(member.id);
  t.is(count, 1);
  mock.timers.reset();
  // wait for 1 year
  mock.timers.enable({
    apis: ['Date'],
    now: Date.now() + 1000 * 60 * 60 * 24 * 365,
  });
  await t.context.models.notification.cleanExpiredNotifications();
  count = await notificationService.countByUserId(member.id);
  t.is(count, 0);
});

test('should mark notification as read', async t => {
  const { notificationService } = t.context;
  const notification = await notificationService.createInvitation({
    userId: member.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: owner.id,
      inviteId: randomUUID(),
    },
  });
  await notificationService.markAsRead(member.id, notification!.id);
  const updatedNotification = await t.context.models.notification.get(
    notification!.id
  );
  t.is(updatedNotification!.read, true);
});

test('should throw error on mark notification as read if notification is not found', async t => {
  const { notificationService } = t.context;
  await t.throwsAsync(notificationService.markAsRead(member.id, randomUUID()), {
    instanceOf: NotificationNotFound,
  });
});

test('should throw error on mark notification as read if notification user is not the same', async t => {
  const { notificationService, module } = t.context;
  const notification = await notificationService.createInvitation({
    userId: member.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: owner.id,
      inviteId: randomUUID(),
    },
  });
  const otherUser = await module.create(Mockers.User);
  await t.throwsAsync(
    notificationService.markAsRead(otherUser.id, notification!.id),
    {
      instanceOf: NotificationNotFound,
    }
  );
});

test('should use latest doc title in mention notification', async t => {
  const { notificationService, models } = t.context;
  const docId = randomUUID();
  await notificationService.createMention({
    userId: member.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: owner.id,
      doc: {
        id: docId,
        title: 'doc-title-1',
        blockId: 'block-id-1',
        mode: DocMode.page,
      },
    },
  });
  const mentionNotification = await notificationService.createMention({
    userId: member.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: owner.id,
      doc: {
        id: docId,
        title: 'doc-title-2',
        blockId: 'block-id-2',
        mode: DocMode.page,
      },
    },
  });
  t.truthy(mentionNotification);
  mock.method(models.doc, 'findMetas', async () => [
    {
      title: 'doc-title-2-updated',
    },
    {
      title: 'doc-title-1-updated',
    },
  ]);
  const notifications = await notificationService.findManyByUserId(member.id);
  t.is(notifications.length, 2);
  const mention = notifications[0];
  t.is(mention.body.workspace!.id, workspace.id);
  t.is(mention.body.workspace!.name, 'Test Workspace');
  t.is(mention.body.type, NotificationType.Mention);
  const body = mention.body as MentionNotificationBody;
  t.is(body.doc.title, 'doc-title-2-updated');
  t.is(body.doc.mode, DocMode.page);

  const mention2 = notifications[1];
  t.is(mention2.body.workspace!.id, workspace.id);
  t.is(mention2.body.workspace!.name, 'Test Workspace');
  t.is(mention2.body.type, NotificationType.Mention);
  const body2 = mention2.body as MentionNotificationBody;
  t.is(body2.doc.title, 'doc-title-1-updated');
  t.is(body2.doc.mode, DocMode.page);
});

test('should raw doc title in mention notification if no doc found', async t => {
  const { notificationService, models } = t.context;
  const docId = randomUUID();
  await notificationService.createMention({
    userId: member.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: owner.id,
      doc: {
        id: docId,
        title: 'doc-title-1',
        blockId: 'block-id-1',
        mode: DocMode.page,
      },
    },
  });
  await notificationService.createMention({
    userId: member.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: owner.id,
      doc: {
        id: docId,
        title: 'doc-title-2',
        blockId: 'block-id-2',
        mode: DocMode.edgeless,
      },
    },
  });
  mock.method(models.doc, 'findMetas', async () => [null, null]);
  const notifications = await notificationService.findManyByUserId(member.id);
  t.is(notifications.length, 2);
  const mention = notifications[0];
  t.is(mention.body.workspace!.name, 'Test Workspace');
  t.is(mention.body.type, NotificationType.Mention);
  const body = mention.body as MentionNotificationBody;
  t.is(body.doc.title, 'doc-title-2');
  t.is(body.doc.mode, DocMode.edgeless);

  const mention2 = notifications[1];
  t.is(mention2.body.workspace!.name, 'Test Workspace');
  t.is(mention2.body.type, NotificationType.Mention);
  const body2 = mention2.body as MentionNotificationBody;
  t.is(body2.doc.title, 'doc-title-1');
  t.is(body2.doc.mode, DocMode.page);
});

test('should send mention email by user setting', async t => {
  const { notificationService, module } = t.context;
  const docId = randomUUID();
  const notification = await notificationService.createMention({
    userId: member.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: owner.id,
      doc: {
        id: docId,
        title: 'doc-title-1',
        blockId: 'block-id-1',
        mode: DocMode.page,
      },
    },
  });
  t.truthy(notification);
  // should send mention email
  const mentionMail = module.mails.last('Mention');
  t.is(mentionMail.to, member.email);

  // update user setting to not receive mention email
  const mentionMailCount = module.mails.count('Mention');
  await module.create(Mockers.UserSettings, {
    userId: member.id,
    receiveMentionEmail: false,
  });
  await notificationService.createMention({
    userId: member.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: owner.id,
      doc: {
        id: docId,
        title: 'doc-title-2',
        blockId: 'block-id-2',
        mode: DocMode.page,
      },
    },
  });
  // should not send mention email
  t.is(module.mails.count('Mention'), mentionMailCount);
});

test('should send mention email with use client doc title if server doc title is empty', async t => {
  const { notificationService, module } = t.context;
  const docId = randomUUID();
  await module.create(Mockers.DocMeta, {
    workspaceId: workspace.id,
    docId,
    // mock empty title
    title: '',
  });
  const notification = await notificationService.createMention({
    userId: member.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: owner.id,
      doc: {
        id: docId,
        title: 'doc-title-1',
        blockId: 'block-id-1',
        mode: DocMode.page,
      },
    },
  });
  t.truthy(notification);
  const mentionMail = module.mails.last('Mention');
  t.is(mentionMail.to, member.email);
  t.is(mentionMail.props.doc.title, 'doc-title-1');
});
