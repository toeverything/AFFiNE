import {
  getInviteInfoQuery,
  inviteByEmailsMutation,
  WorkspaceMemberStatus,
} from '@affine/graphql';

import { WorkspaceRole } from '../../../models';
import { Mockers } from '../../mocks';
import { app, e2e } from '../test';

const createTeamWorkspace = async (memberLimit = 3) => {
  const owner = await app.create(Mockers.User);
  const workspace = await app.create(Mockers.Workspace, {
    owner: {
      id: owner.id,
    },
  });
  await app.create(Mockers.TeamWorkspace, {
    id: workspace.id,
    quantity: memberLimit,
  });

  const writer = await app.create(Mockers.User);
  await app.create(Mockers.WorkspaceUser, {
    userId: writer.id,
    workspaceId: workspace.id,
  });

  const admin = await app.create(Mockers.User);
  await app.create(Mockers.WorkspaceUser, {
    userId: admin.id,
    workspaceId: workspace.id,
    type: WorkspaceRole.Admin,
  });

  const external = await app.create(Mockers.User);

  return {
    workspace,
    owner,
    admin,
    writer,
    external,
  };
};

const getInvitationInfo = async (inviteId: string) => {
  const result = await app.gql({
    query: getInviteInfoQuery,
    variables: {
      inviteId,
    },
  });
  return result.getInviteInfo;
};

e2e('should set new invited users to AllocatingSeat', async t => {
  const { owner, workspace } = await createTeamWorkspace();
  await app.login(owner);

  const u1 = await app.createUser();

  const result = await app.gql({
    query: inviteByEmailsMutation,
    variables: {
      workspaceId: workspace.id,
      emails: [u1.email],
    },
  });

  t.not(result.inviteMembers[0].inviteId, null);

  const invitationInfo = await getInvitationInfo(
    result.inviteMembers[0].inviteId!
  );
  t.is(invitationInfo.status, WorkspaceMemberStatus.AllocatingSeat);
});

e2e('should allocate seats', async t => {
  const { owner, workspace } = await createTeamWorkspace();
  await app.login(owner);

  const u1 = await app.createUser();
  await app.create(Mockers.WorkspaceUser, {
    userId: u1.id,
    workspaceId: workspace.id,
    status: WorkspaceMemberStatus.AllocatingSeat,
    source: 'Email',
  });

  const u2 = await app.createUser();
  await app.create(Mockers.WorkspaceUser, {
    userId: u2.id,
    workspaceId: workspace.id,
    status: WorkspaceMemberStatus.AllocatingSeat,
    source: 'Link',
  });

  await app.eventBus.emitAsync('workspace.members.allocateSeats', {
    workspaceId: workspace.id,
    quantity: 5,
  });

  const [members] = await app.models.workspaceUser.paginate(workspace.id, {
    first: 10,
    offset: 0,
  });

  t.is(
    members.find(m => m.user.id === u1.id)?.status,
    WorkspaceMemberStatus.Pending
  );
  t.is(
    members.find(m => m.user.id === u2.id)?.status,
    WorkspaceMemberStatus.Accepted
  );

  t.is(app.queue.count('notification.sendInvitation'), 1);
});

e2e('should set all rests to NeedMoreSeat', async t => {
  const { owner, workspace } = await createTeamWorkspace();
  await app.login(owner);

  const u1 = await app.createUser();
  await app.create(Mockers.WorkspaceUser, {
    userId: u1.id,
    workspaceId: workspace.id,
    status: WorkspaceMemberStatus.AllocatingSeat,
    source: 'Email',
  });

  const u2 = await app.createUser();
  await app.create(Mockers.WorkspaceUser, {
    userId: u2.id,
    workspaceId: workspace.id,
    status: WorkspaceMemberStatus.AllocatingSeat,
    source: 'Email',
  });

  const u3 = await app.createUser();
  await app.create(Mockers.WorkspaceUser, {
    userId: u3.id,
    workspaceId: workspace.id,
    status: WorkspaceMemberStatus.AllocatingSeat,
    source: 'Link',
  });

  await app.eventBus.emitAsync('workspace.members.allocateSeats', {
    workspaceId: workspace.id,
    quantity: 4,
  });

  const [members] = await app.models.workspaceUser.paginate(workspace.id, {
    first: 10,
    offset: 0,
  });

  t.is(
    members.find(m => m.user.id === u2.id)?.status,
    WorkspaceMemberStatus.NeedMoreSeat
  );
  t.is(
    members.find(m => m.user.id === u3.id)?.status,
    WorkspaceMemberStatus.NeedMoreSeat
  );
});
