import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';

import test from 'ava';

import { createModule } from '../../../__tests__/create-module';
import { Mockers, MockMailer } from '../../../__tests__/mocks';
import { Due, NotificationNotFound } from '../../../base';
import {
  DocMode,
  MentionNotificationBody,
  Models,
  NotificationType,
  User,
  Workspace,
  WorkspaceMemberStatus,
} from '../../../models';
import { DocStorageModule } from '../../doc';
import { FeatureModule } from '../../features';
import { MailModule } from '../../mail';
import { Mailer } from '../../mail/mailer';
import { PermissionModule } from '../../permission';
import { StorageModule } from '../../storage';
import { NotificationModule } from '../index';
import { NotificationService } from '../service';

const module = await createModule({
  imports: [
    FeatureModule,
    PermissionModule,
    DocStorageModule,
    StorageModule,
    MailModule,
    NotificationModule,
  ],
  providers: [NotificationService],
  tapModule: builder => {
    builder.overrideProvider(Mailer).useValue(new MockMailer());
  },
});
const notificationService = module.get(NotificationService);
const models = module.get(Models);
const mailer = module.get(Mailer) as unknown as MockMailer;

let owner: User;
let member: User;
let workspace: Workspace;

test.beforeEach(async () => {
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

test.after.always(async () => {
  await module.close();
});

test('should create invitation notification and email', async t => {
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
  const invitationMail = mailer.last('MemberInvitation');
  t.is(invitationMail.to, member.email);
  t.is(invitationMail.name, 'MemberInvitation');
});

test('should not send invitation email when workspace name contains domain', async t => {
  const spamWorkspace = await module.create(Mockers.Workspace, {
    owner: {
      id: owner.id,
    },
    name: 'BTC example.com',
  });
  const inviteId = randomUUID();
  const invitationMailCount = mailer.send.callCount;
  const skippedMailCount = mailer.skip.callCount;

  const notification = await notificationService.createInvitation({
    userId: member.id,
    body: {
      workspaceId: spamWorkspace.id,
      createdByUserId: owner.id,
      inviteId,
    },
  });

  t.truthy(notification);
  t.is(mailer.send.callCount, invitationMailCount);
  t.is(mailer.skip.callCount, skippedMailCount + 1);
  t.is(mailer.skip.lastCall.args[1].reason, 'workspace_name_contains_domain');
});

test('should not send invitation email if user setting is not to receive invitation email', async t => {
  const inviteId = randomUUID();
  await module.create(Mockers.UserSettings, {
    userId: member.id,
    receiveInvitationEmail: false,
  });
  const invitationMailCount = mailer.send.callCount;
  const skippedMailCount = mailer.skip.callCount;

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
  t.is(mailer.send.callCount, invitationMailCount);
  t.is(mailer.skip.callCount, skippedMailCount + 1);
  t.is(mailer.skip.lastCall.args[1].reason, 'recipient_notification_disabled');
});

test('should not create invitation notification if user is already a member', async t => {
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
  const invitationAcceptedMail = mailer.last('MemberAccepted');
  t.is(invitationAcceptedMail.to, owner.email);
  t.is(invitationAcceptedMail.name, 'MemberAccepted');
});

test('should not send invitation accepted email if user settings is not receive invitation email', async t => {
  const { id: inviteId } = await module.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: member.id,
  });
  // should not send email if user settings is not receive invitation email
  await module.create(Mockers.UserSettings, {
    userId: owner.id,
    receiveInvitationEmail: false,
  });
  const invitationAcceptedMailCount = mailer.send.callCount;

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
  t.is(mailer.send.callCount, invitationAcceptedMailCount);
});

test('should not create invitation accepted notification if user is not an active member', async t => {
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
  const invitationReviewRequestMail = mailer.last(
    'LinkInvitationReviewRequest'
  );
  t.is(invitationReviewRequestMail.to, owner.email);
  t.is(invitationReviewRequestMail.name, 'LinkInvitationReviewRequest');
});

test('should not create invitation review request notification if user is an active member', async t => {
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
  const invitationReviewApprovedMail = mailer.last('LinkInvitationApprove');
  t.is(invitationReviewApprovedMail.to, member.email);
  t.is(invitationReviewApprovedMail.name, 'LinkInvitationApprove');
});

test('should not create invitation review approved notification if user is not an active member', async t => {
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
  const invitationReviewDeclinedMail = mailer.last('LinkInvitationDecline');
  t.is(invitationReviewDeclinedMail.to, member.email);
  t.is(invitationReviewDeclinedMail.name, 'LinkInvitationDecline');
});

test('should not create invitation review declined notification if user is an active member', async t => {
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
    now: Due.after('100d'),
  });

  await models.notification.cleanExpiredNotifications();

  count = await notificationService.countByUserId(member.id);
  t.is(count, 1);

  mock.timers.reset();
  // wait for 1 year
  mock.timers.enable({
    apis: ['Date'],
    now: Due.after('1y'),
  });

  await models.notification.cleanExpiredNotifications();

  count = await notificationService.countByUserId(member.id);
  t.is(count, 0);
});

test('should mark notification as read', async t => {
  const notification = await notificationService.createInvitation({
    userId: member.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: owner.id,
      inviteId: randomUUID(),
    },
  });

  await notificationService.markAsRead(member.id, notification!.id);

  const updatedNotification = await models.notification.get(notification!.id);
  t.is(updatedNotification!.read, true);
});

test('should throw error on mark notification as read if notification is not found', async t => {
  await t.throwsAsync(notificationService.markAsRead(member.id, randomUUID()), {
    instanceOf: NotificationNotFound,
  });
});

test('should throw error on mark notification as read if notification user is not the same', async t => {
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
  const mentionMail = mailer.last('Mention');
  t.is(mentionMail.to, member.email);
  t.is(mentionMail.name, 'Mention');

  // update user setting to not receive mention email
  const mentionMailCount = mailer.send.callCount;
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
  t.is(mailer.send.callCount, mentionMailCount);
});

test('should send mention email with use client doc title if server doc title is empty', async t => {
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

  const mentionMail = mailer.last('Mention');
  t.is(mentionMail.to, member.email);
  t.is(mentionMail.name, 'Mention');
  t.is(mentionMail.props.doc.title, 'doc-title-1');
});

test('should send comment notification and email', async t => {
  const docId = randomUUID();
  const commentId = randomUUID();

  const notification = await notificationService.createComment({
    userId: member.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: owner.id,
      doc: {
        id: docId,
        title: 'doc-title-1',
        mode: DocMode.page,
      },
      commentId,
    },
  });

  t.truthy(notification);

  const commentMail = mailer.last('Comment');
  t.is(commentMail.to, member.email);
  t.is(commentMail.name, 'Comment');
});

test('should send comment mention notification and email', async t => {
  const docId = randomUUID();
  const commentId = randomUUID();
  const replyId = randomUUID();

  const notification = await notificationService.createComment(
    {
      userId: member.id,
      body: {
        workspaceId: workspace.id,
        createdByUserId: owner.id,
        doc: {
          id: docId,
          title: 'doc-title-1',
          mode: DocMode.page,
        },
        commentId,
        replyId,
      },
    },
    true
  );

  t.truthy(notification);

  const commentMentionMail = mailer.last('CommentMention');
  t.is(commentMentionMail.to, member.email);
  t.is(commentMentionMail.name, 'CommentMention');
});

test('should send comment email by user setting', async t => {
  const docId = randomUUID();

  const notification = await notificationService.createComment({
    userId: member.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: owner.id,
      doc: {
        id: docId,
        title: 'doc-title-1',
        mode: DocMode.page,
      },
      commentId: randomUUID(),
    },
  });

  t.truthy(notification);

  const commentMail = mailer.last('Comment');
  t.is(commentMail.to, member.email);
  t.is(commentMail.name, 'Comment');

  // update user setting to not receive comment email
  const commentMailCount = mailer.send.callCount;
  await module.create(Mockers.UserSettings, {
    userId: member.id,
    receiveCommentEmail: false,
  });

  await notificationService.createComment({
    userId: member.id,
    body: {
      workspaceId: workspace.id,
      createdByUserId: owner.id,
      doc: {
        id: docId,
        title: 'doc-title-2',
        mode: DocMode.page,
      },
      commentId: randomUUID(),
    },
  });

  // should not send comment email
  t.is(mailer.send.callCount, commentMailCount);
});
