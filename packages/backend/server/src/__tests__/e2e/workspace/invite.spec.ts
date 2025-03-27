import {
  acceptInviteByInviteIdMutation,
  createInviteLinkMutation,
  getInviteInfoQuery,
  getMembersByWorkspaceIdQuery,
  inviteByEmailMutation,
  leaveWorkspaceMutation,
  revokeMemberPermissionMutation,
  WorkspaceInviteLinkExpireTime,
  WorkspaceMemberStatus,
} from '@affine/graphql';
import { faker } from '@faker-js/faker';

import { Models } from '../../../models';
import { Mockers } from '../../mocks';
import { app, e2e } from '../test';

e2e('should invite a user', async t => {
  const u2 = await app.signup();
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  const result = await app.gql({
    query: inviteByEmailMutation,
    variables: {
      email: u2.email,
      workspaceId: workspace.id,
    },
  });
  t.truthy(result, 'failed to invite user');
  // add invitation notification job
  const invitationNotification = app.queue.last('notification.sendInvitation');
  t.is(invitationNotification.payload.inviterId, owner.id);
  t.is(invitationNotification.payload.inviteId, result.invite);

  // invitation status is pending
  const { getInviteInfo } = await app.gql({
    query: getInviteInfoQuery,
    variables: {
      inviteId: result.invite,
    },
  });
  t.is(getInviteInfo.status, WorkspaceMemberStatus.Pending);

  // u2 accept invite
  await app.switchUser(u2);
  await app.gql({
    query: acceptInviteByInviteIdMutation,
    variables: {
      workspaceId: workspace.id,
      inviteId: result.invite,
    },
  });

  // invitation status is accepted
  const { getInviteInfo: getInviteInfo2 } = await app.gql({
    query: getInviteInfoQuery,
    variables: {
      inviteId: result.invite,
    },
  });
  t.is(getInviteInfo2.status, WorkspaceMemberStatus.Accepted);
});

e2e('should leave a workspace', async t => {
  const u2 = await app.signup();
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: u2.id,
  });

  app.switchUser(u2.id);
  const { leaveWorkspace } = await app.gql({
    query: leaveWorkspaceMutation,
    variables: {
      workspaceId: workspace.id,
    },
  });

  t.true(leaveWorkspace, 'failed to leave workspace');
});

e2e('should revoke a user', async t => {
  const u2 = await app.signup();
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: u2.id,
  });

  const { revoke } = await app.gql({
    query: revokeMemberPermissionMutation,
    variables: {
      workspaceId: workspace.id,
      userId: u2.id,
    },
  });
  t.true(revoke, 'failed to revoke user');
});

e2e('should revoke a user on under review', async t => {
  const user = await app.signup();
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: user.id,
    status: WorkspaceMemberStatus.UnderReview,
  });

  const { revoke } = await app.gql({
    query: revokeMemberPermissionMutation,
    variables: {
      workspaceId: workspace.id,
      userId: user.id,
    },
  });
  t.true(revoke, 'failed to revoke user');
  const requestDeclinedNotification = app.queue.last(
    'notification.sendInvitationReviewDeclined'
  );
  t.truthy(requestDeclinedNotification);
  t.deepEqual(
    requestDeclinedNotification.payload,
    {
      userId: user.id,
      workspaceId: workspace.id,
      reviewerId: owner.id,
    },
    'should send review declined notification'
  );
});

e2e('should create user if not exist', async t => {
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  const email = faker.internet.email();
  await app.gql({
    query: inviteByEmailMutation,
    variables: {
      email,
      workspaceId: workspace.id,
    },
  });

  const u2 = await app.get(Models).user.getUserByEmail(email);
  t.truthy(u2, 'failed to create user');
});

e2e('should invite a user by link', async t => {
  const u2 = await app.signup();
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  const invite1 = await app.gql({
    query: inviteByEmailMutation,
    variables: {
      email: u2.email,
      workspaceId: workspace.id,
    },
  });

  app.switchUser(u2);
  const accept = await app.gql({
    query: acceptInviteByInviteIdMutation,
    variables: {
      inviteId: invite1.invite,
      workspaceId: workspace.id,
    },
  });
  t.true(accept.acceptInviteById, 'failed to accept invite');

  app.switchUser(owner);
  const invite2 = await app.gql({
    query: inviteByEmailMutation,
    variables: {
      email: u2.email,
      workspaceId: workspace.id,
    },
  });

  t.is(
    invite2.invite,
    invite1.invite,
    'repeat the invitation must return same id'
  );

  const member = await app
    .get(Models)
    .workspaceUser.getActive(workspace.id, u2.id);
  t.truthy(member, 'failed to invite user');
  t.is(member!.id, invite1.invite, 'failed to check invite id');
});

e2e('should send invitation notification and leave email', async t => {
  const u2 = await app.signup();
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  const invite = await app.gql({
    query: inviteByEmailMutation,
    variables: {
      email: u2.email,
      workspaceId: workspace.id,
    },
  });

  const invitationNotification = app.queue.last('notification.sendInvitation');
  t.is(invitationNotification.payload.inviterId, owner.id);
  t.is(invitationNotification.payload.inviteId, invite.invite);

  app.switchUser(u2);
  const accept = await app.gql({
    query: acceptInviteByInviteIdMutation,
    variables: {
      inviteId: invite.invite,
      workspaceId: workspace.id,
    },
  });
  t.true(accept.acceptInviteById, 'failed to accept invite');

  const acceptedNotification = app.queue.last(
    'notification.sendInvitationAccepted'
  );
  t.is(acceptedNotification.payload.inviterId, owner.id);
  t.is(acceptedNotification.payload.inviteId, invite.invite);

  const leave = await app.gql({
    query: leaveWorkspaceMutation,
    variables: {
      workspaceId: workspace.id,
      sendLeaveMail: true,
    },
  });
  t.true(leave.leaveWorkspace, 'failed to leave workspace');

  const leaveMail = app.mails.last('MemberLeave');

  t.is(leaveMail.to, owner.email);
  t.is(leaveMail.props.user.$$userId, u2.id);
});

e2e('should support pagination for member', async t => {
  const u1 = await app.signup();
  const u2 = await app.signup();
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: u1.id,
  });
  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: u2.id,
  });

  let result = await app.gql({
    query: getMembersByWorkspaceIdQuery,
    variables: {
      workspaceId: workspace.id,
      skip: 0,
      take: 2,
    },
  });
  t.is(result.workspace.memberCount, 3);
  t.is(result.workspace.members.length, 2);

  result = await app.gql({
    query: getMembersByWorkspaceIdQuery,
    variables: {
      workspaceId: workspace.id,
      skip: 2,
      take: 2,
    },
  });
  t.is(result.workspace.memberCount, 3);
  t.is(result.workspace.members.length, 1);

  result = await app.gql({
    query: getMembersByWorkspaceIdQuery,
    variables: {
      workspaceId: workspace.id,
      skip: 3,
      take: 2,
    },
  });
  t.is(result.workspace.memberCount, 3);
  t.is(result.workspace.members.length, 0);
});

e2e('should limit member count correctly', async t => {
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });
  await Promise.all(
    Array.from({ length: 10 }).map(async () => {
      const user = await app.signup();
      await app.create(Mockers.WorkspaceUser, {
        workspaceId: workspace.id,
        userId: user.id,
      });
    })
  );

  await app.switchUser(owner);
  const result = await app.gql({
    query: getMembersByWorkspaceIdQuery,
    variables: {
      workspaceId: workspace.id,
      skip: 0,
      take: 10,
    },
  });
  t.is(result.workspace.memberCount, 11);
  t.is(result.workspace.members.length, 10);
});

e2e('should get invite link info with status', async t => {
  const owner = await app.signup();

  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  await app.login(owner);
  const { createInviteLink } = await app.gql({
    query: createInviteLinkMutation,
    variables: {
      workspaceId: workspace.id,
      expireTime: WorkspaceInviteLinkExpireTime.OneDay,
    },
  });
  t.truthy(createInviteLink, 'failed to create invite link');
  const link = createInviteLink.link;
  const inviteId = link.split('/').pop()!;

  // owner/member see accept status
  const { getInviteInfo } = await app.gql({
    query: getInviteInfoQuery,
    variables: {
      inviteId,
    },
  });
  t.truthy(getInviteInfo, 'failed to get invite info');
  t.is(getInviteInfo.status, WorkspaceMemberStatus.Accepted);

  // non-member see null status
  await app.signup();
  const { getInviteInfo: getInviteInfo2 } = await app.gql({
    query: getInviteInfoQuery,
    variables: {
      inviteId,
    },
  });
  t.truthy(getInviteInfo2, 'failed to get invite info');
  t.is(getInviteInfo2.status, null);

  // pending-member see under review status
  await app.signup();
  await app.gql({
    query: acceptInviteByInviteIdMutation,
    variables: {
      workspaceId: workspace.id,
      inviteId,
    },
  });
  const { getInviteInfo: getInviteInfo3 } = await app.gql({
    query: getInviteInfoQuery,
    variables: {
      inviteId,
    },
  });
  t.truthy(getInviteInfo3, 'failed to get invite info');
  t.is(getInviteInfo3.status, WorkspaceMemberStatus.UnderReview);
});
