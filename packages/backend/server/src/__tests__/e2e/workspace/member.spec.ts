import {
  acceptInviteByInviteIdMutation,
  approveWorkspaceTeamMemberMutation,
  createInviteLinkMutation,
  getInviteInfoQuery,
  getMembersByWorkspaceIdQuery,
  inviteByEmailsMutation,
  leaveWorkspaceMutation,
  revokeMemberPermissionMutation,
  WorkspaceInviteLinkExpireTime,
  WorkspaceMemberStatus,
} from '@affine/graphql';
import { faker } from '@faker-js/faker';

import { Models } from '../../../models';
import { Mockers } from '../../mocks';
import { app, e2e } from '../test';

async function createWorkspace() {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: { id: owner.id },
  });

  return {
    owner,
    workspace,
  };
}

e2e('should invite a user', async t => {
  const { owner, workspace } = await createWorkspace();
  const u2 = await app.create(Mockers.User);

  await app.login(owner);
  const result = await app.gql({
    query: inviteByEmailsMutation,
    variables: {
      emails: [u2.email],
      workspaceId: workspace.id,
    },
  });

  t.truthy(result, 'failed to invite user');
  // add invitation notification job
  const invitationNotification = await app.queue.waitFor(
    'notification.sendInvitation'
  );
  t.is(invitationNotification.payload.inviterId, owner.id);
  t.is(
    invitationNotification.payload.inviteId,
    result.inviteMembers[0].inviteId!
  );

  // invitation status is pending
  const { getInviteInfo } = await app.gql({
    query: getInviteInfoQuery,
    variables: {
      inviteId: invitationNotification.payload.inviteId,
    },
  });
  t.is(getInviteInfo.status, WorkspaceMemberStatus.Pending);

  // u2 accept invite
  await app.login(u2);
  await app.gql({
    query: acceptInviteByInviteIdMutation,
    variables: {
      workspaceId: workspace.id,
      inviteId: invitationNotification.payload.inviteId,
    },
  });

  // invitation status is accepted
  const { getInviteInfo: getInviteInfo2 } = await app.gql({
    query: getInviteInfoQuery,
    variables: {
      inviteId: invitationNotification.payload.inviteId,
    },
  });
  t.is(getInviteInfo2.status, WorkspaceMemberStatus.Accepted);
});

e2e('should leave a workspace', async t => {
  const { owner, workspace } = await createWorkspace();
  const u2 = await app.create(Mockers.User);
  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: u2.id,
  });

  await app.login(u2);
  const { leaveWorkspace } = await app.gql({
    query: leaveWorkspaceMutation,
    variables: {
      workspaceId: workspace.id,
    },
  });

  t.true(leaveWorkspace, 'failed to leave workspace');

  const leaveMail = await app.mails.waitFor('MemberLeave');

  t.is(leaveMail.to, owner.email);
  t.is(leaveMail.props.user.$$userId, u2.id);
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

  const { revokeMember } = await app.gql({
    query: revokeMemberPermissionMutation,
    variables: {
      workspaceId: workspace.id,
      userId: u2.id,
    },
  });
  t.true(revokeMember, 'failed to revoke user');
});

e2e('should approve a user on under review', async t => {
  const { owner, workspace } = await createWorkspace();
  const user = await app.create(Mockers.User);
  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: user.id,
    status: WorkspaceMemberStatus.UnderReview,
  });

  await app.login(owner);
  const { approveMember } = await app.gql({
    query: approveWorkspaceTeamMemberMutation,
    variables: {
      workspaceId: workspace.id,
      userId: user.id,
    },
  });

  t.true(approveMember, 'failed to approve member');

  t.is(
    (await app.get(Models).workspaceUser.get(workspace.id, user.id))?.status,
    WorkspaceMemberStatus.Accepted
  );
});

e2e('should revoke a user on under review', async t => {
  const { owner, workspace } = await createWorkspace();
  const user = await app.create(Mockers.User);
  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: user.id,
    status: WorkspaceMemberStatus.UnderReview,
  });

  await app.login(owner);
  const { revokeMember } = await app.gql({
    query: revokeMemberPermissionMutation,
    variables: {
      workspaceId: workspace.id,
      userId: user.id,
    },
  });
  t.true(revokeMember, 'failed to revoke user');
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
  const { owner, workspace } = await createWorkspace();

  const email = faker.internet.email();
  await app.login(owner);
  await app.gql({
    query: inviteByEmailsMutation,
    variables: {
      emails: [email],
      workspaceId: workspace.id,
    },
  });

  const u2 = await app.get(Models).user.getUserByEmail(email);
  t.truthy(u2, 'failed to create user');
});

e2e('should support pagination for member', async t => {
  const { owner, workspace } = await createWorkspace();
  const u1 = await app.create(Mockers.User);
  const u2 = await app.create(Mockers.User);

  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: u1.id,
  });
  await app.create(Mockers.WorkspaceUser, {
    workspaceId: workspace.id,
    userId: u2.id,
  });

  await app.login(owner);
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
  const { owner, workspace } = await createWorkspace();

  await Promise.all(
    Array.from({ length: 10 }).map(async () => {
      const user = await app.create(Mockers.User);
      await app.create(Mockers.WorkspaceUser, {
        workspaceId: workspace.id,
        userId: user.id,
      });
    })
  );

  await app.login(owner);
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
  const { owner, workspace } = await createWorkspace();

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

e2e(
  'should accept invitation by link directly if status is pending',
  async t => {
    const { owner, workspace } = await createWorkspace();
    const member = await app.create(Mockers.User);

    await app.login(owner);
    // create a pending invitation
    const invite = await app.gql({
      query: inviteByEmailsMutation,
      variables: {
        emails: [member.email],
        workspaceId: workspace.id,
      },
    });
    t.truthy(invite, 'failed to create invitation');

    const { createInviteLink } = await app.gql({
      query: createInviteLinkMutation,
      variables: {
        workspaceId: workspace.id,
        expireTime: WorkspaceInviteLinkExpireTime.OneDay,
      },
    });
    t.truthy(createInviteLink, 'failed to create invite link');
    const link = createInviteLink.link;
    const inviteLinkId = link.split('/').pop()!;

    // member accept invitation by link
    await app.login(member);
    await app.gql({
      query: acceptInviteByInviteIdMutation,
      variables: {
        inviteId: inviteLinkId,
        workspaceId: workspace.id,
      },
    });

    const { getInviteInfo } = await app.gql({
      query: getInviteInfoQuery,
      variables: {
        inviteId: invite.inviteMembers[0].inviteId!,
      },
    });
    t.is(getInviteInfo.status, WorkspaceMemberStatus.Accepted);
  }
);

e2e(
  'should invite by link and send review request notification below quota limit',
  async t => {
    const { owner, workspace } = await createWorkspace();

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

    // accept invite by link
    await app.signup();
    const result = await app.gql({
      query: acceptInviteByInviteIdMutation,
      variables: {
        workspaceId: workspace.id,
        inviteId,
      },
    });
    t.truthy(result, 'failed to accept invite');
    const notification = app.queue.last(
      'notification.sendInvitationReviewRequest'
    );
    t.is(notification.payload.reviewerId, owner.id);
    t.truthy(notification.payload.inviteId);
  }
);

e2e(
  'should invite by link and send review request notification over quota limit',
  async t => {
    const { owner, workspace } = await createWorkspace();
    await app.create(Mockers.TeamWorkspace, {
      id: workspace.id,
      quantity: 3,
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

    // accept invite by link
    await app.signup();
    const result = await app.gql({
      query: acceptInviteByInviteIdMutation,
      variables: {
        workspaceId: workspace.id,
        inviteId,
      },
    });
    t.truthy(result, 'failed to accept invite');
    const notification = app.queue.last(
      'notification.sendInvitationReviewRequest'
    );
    t.is(notification.payload.reviewerId, owner.id);
    t.truthy(notification.payload.inviteId);
  }
);

e2e(
  'should search members by name and email support case insensitive',
  async t => {
    const { owner, workspace } = await createWorkspace();
    const user1 = await app.create(Mockers.User, {
      name: faker.internet.displayName({ firstName: 'Lucy' }),
    });
    const user2 = await app.create(Mockers.User, {
      email: faker.internet.email({
        firstName: 'Jeanne',
        lastName: 'Doe',
      }),
    });
    await app.create(Mockers.WorkspaceUser, {
      workspaceId: workspace.id,
      userId: user1.id,
    });
    await app.create(Mockers.WorkspaceUser, {
      workspaceId: workspace.id,
      userId: user2.id,
    });

    await app.login(owner);
    let result = await app.gql({
      query: getMembersByWorkspaceIdQuery,
      variables: {
        workspaceId: workspace.id,
        query: 'lucy',
      },
    });
    t.is(result.workspace.memberCount, 3);
    t.is(result.workspace.members.length, 1);
    t.is(result.workspace.members[0].name, user1.name);

    result = await app.gql({
      query: getMembersByWorkspaceIdQuery,
      variables: {
        workspaceId: workspace.id,
        query: 'LUCY',
      },
    });
    t.is(result.workspace.memberCount, 3);
    t.is(result.workspace.members.length, 1);
    t.is(result.workspace.members[0].name, user1.name);

    result = await app.gql({
      query: getMembersByWorkspaceIdQuery,
      variables: {
        workspaceId: workspace.id,
        query: 'jeanne_doe',
      },
    });
    t.is(result.workspace.memberCount, 3);
    t.is(result.workspace.members.length, 1);
    t.is(result.workspace.members[0].email, user2.email);
  }
);
