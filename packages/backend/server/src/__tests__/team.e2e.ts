import { randomUUID } from 'node:crypto';

import { User, WorkspaceMemberStatus } from '@prisma/client';
import type { TestFn } from 'ava';
import ava from 'ava';
import { nanoid } from 'nanoid';
import Sinon from 'sinon';

import { AppModule } from '../app.module';
import { EventBus } from '../base';
import { AuthService } from '../core/auth';
import { DocReader } from '../core/doc';
import { DocRole, WorkspaceRole } from '../core/permission';
import { WorkspaceType } from '../core/workspaces';
import { Models } from '../models';
import {
  acceptInviteById,
  approveMember,
  createInviteLink,
  createTestingApp,
  createWorkspace,
  docGrantedUsersList,
  getInviteInfo,
  getInviteLink,
  getWorkspace,
  grantDocUserRoles,
  grantMember,
  inviteUser,
  inviteUsers,
  leaveWorkspace,
  revokeDocUserRoles,
  revokeInviteLink,
  revokeMember,
  revokeUser,
  sleep,
  TestingApp,
  updateDocDefaultRole,
} from './utils';

const test = ava as TestFn<{
  app: TestingApp;
  auth: AuthService;
  event: Sinon.SinonStubbedInstance<EventBus>;
  models: Models;
}>;

test.before(async t => {
  const app = await createTestingApp({
    imports: [AppModule],
    tapModule: module => {
      module
        .overrideProvider(EventBus)
        .useValue(Sinon.createStubInstance(EventBus));
      module.overrideProvider(DocReader).useValue({
        getWorkspaceContent() {
          return {
            name: 'test',
            avatarKey: null,
          };
        },
      });
    },
  });

  t.context.app = app;
  t.context.auth = app.get(AuthService);
  t.context.event = app.get(EventBus);
  t.context.models = app.get(Models);
});

test.beforeEach(async t => {
  await t.context.app.initTestingDB();
});

test.after.always(async t => {
  await t.context.app.close();
});

const init = async (
  app: TestingApp,
  memberLimit = 10,
  prefix = randomUUID()
) => {
  const owner = await app.signupV1(`${prefix}owner@affine.pro`);
  const models = app.get(Models);
  {
    await models.userFeature.add(owner.id, 'pro_plan_v1', 'test');
  }

  const workspace = await createWorkspace(app);
  const teamWorkspace = await createWorkspace(app);
  {
    models.workspaceFeature.add(teamWorkspace.id, 'team_plan_v1', 'test', {
      memberLimit,
    });
  }

  const invite = async (
    email: string,
    permission: WorkspaceRole = WorkspaceRole.Collaborator,
    shouldSendEmail: boolean = false
  ) => {
    const member = await app.signupV1(email);

    {
      // normal workspace
      app.switchUser(owner);
      const inviteId = await inviteUser(
        app,
        workspace.id,
        member.email,
        shouldSendEmail
      );
      app.switchUser(member);
      await acceptInviteById(app, workspace.id, inviteId, shouldSendEmail);
    }

    {
      // team workspace
      app.switchUser(owner);
      const inviteId = await inviteUser(
        app,
        teamWorkspace.id,
        member.email,
        shouldSendEmail
      );
      app.switchUser(member);
      await acceptInviteById(app, teamWorkspace.id, inviteId, shouldSendEmail);
      app.switchUser(owner);
      await grantMember(app, teamWorkspace.id, member.id, permission);
    }

    return member;
  };

  const inviteBatch = async (
    emails: string[],
    shouldSendEmail: boolean = false
  ) => {
    const members = [];
    for (const email of emails) {
      const member = await app.signupV1(email);
      members.push(member);
    }

    app.switchUser(owner);
    const invites = await inviteUsers(
      app,
      teamWorkspace.id,
      emails,
      shouldSendEmail
    );
    return [members, invites] as const;
  };

  const getCreateInviteLinkFetcher = async (ws: WorkspaceType) => {
    app.switchUser(owner);
    const { link } = await createInviteLink(app, ws.id, 'OneDay');
    const inviteId = link.split('/').pop()!;
    return [
      inviteId,
      async (email: string, shouldSendEmail: boolean = false) => {
        const member = await app.signupV1(email);
        await acceptInviteById(app, ws.id, inviteId, shouldSendEmail);
        return member;
      },
      async (userId: string) => {
        app.switchUser(userId);
        await acceptInviteById(app, ws.id, inviteId, false);
      },
    ] as const;
  };

  const admin = await invite(`${prefix}admin@affine.pro`, WorkspaceRole.Admin);
  const write = await invite(`${prefix}write@affine.pro`);
  const read = await invite(
    `${prefix}read@affine.pro`,
    WorkspaceRole.Collaborator
  );

  const external = await invite(
    `${prefix}external@affine.pro`,
    WorkspaceRole.External
  );

  app.switchUser(owner.id);
  return {
    invite,
    inviteBatch,
    createInviteLink: getCreateInviteLinkFetcher,
    owner,
    workspace,
    teamWorkspace,
    admin,
    write,
    read,
    external,
  };
};

test('should be able to invite multiple users', async t => {
  const { app } = t.context;
  const { teamWorkspace: ws, owner, admin, write, read } = await init(app, 5);

  {
    // no permission
    app.switchUser(read);
    await t.throwsAsync(
      inviteUsers(app, ws.id, ['test@affine.pro']),
      { instanceOf: Error },
      'should throw error if not manager'
    );
    app.switchUser(write);
    await t.throwsAsync(
      inviteUsers(app, ws.id, ['test@affine.pro']),
      { instanceOf: Error },
      'should throw error if not manager'
    );
  }

  {
    // manager
    const m1 = await app.signupV1('m1@affine.pro');
    const m2 = await app.signupV1('m2@affine.pro');
    app.switchUser(owner);
    t.is(
      (await inviteUsers(app, ws.id, [m1.email])).length,
      1,
      'should be able to invite user'
    );
    app.switchUser(admin);
    t.is(
      (await inviteUsers(app, ws.id, [m2.email])).length,
      1,
      'should be able to invite user'
    );
    t.is(
      (await inviteUsers(app, ws.id, [m2.email])).length,
      0,
      'should not be able to invite user if already in workspace'
    );

    await t.throwsAsync(
      inviteUsers(
        app,
        ws.id,
        Array.from({ length: 513 }, (_, i) => `m${i}@affine.pro`)
      ),
      { message: 'Too many requests.' },
      'should throw error if exceed maximum number of invitations per request'
    );
  }
});

test('should be able to check seat limit', async t => {
  const { app, models } = t.context;
  const { invite, inviteBatch, teamWorkspace: ws } = await init(app, 5);

  {
    // invite
    await t.throwsAsync(
      invite('member3@affine.pro', WorkspaceRole.Collaborator),
      { message: 'You have exceeded your workspace member quota.' },
      'should throw error if exceed member limit'
    );
    models.workspaceFeature.add(ws.id, 'team_plan_v1', 'test', {
      memberLimit: 6,
    });
    await t.notThrowsAsync(
      invite('member4@affine.pro', WorkspaceRole.Collaborator),
      'should not throw error if not exceed member limit'
    );
  }

  {
    const members1 = inviteBatch(['member5@affine.pro']);
    // invite batch
    await t.notThrowsAsync(
      members1,
      'should not throw error in batch invite event reach limit'
    );

    t.is(
      (await models.workspaceUser.get(ws.id, (await members1)[0][0].id))
        ?.status,
      WorkspaceMemberStatus.NeedMoreSeat,
      'should be able to check member status'
    );

    // refresh seat, fifo
    await sleep(1000);
    const [[members2]] = await inviteBatch(['member6@affine.pro']);
    await models.workspaceUser.refresh(ws.id, 7);

    t.is(
      (await models.workspaceUser.get(ws.id, (await members1)[0][0].id))
        ?.status,
      WorkspaceMemberStatus.Pending,
      'should become accepted after refresh'
    );
    t.is(
      (await models.workspaceUser.get(ws.id, members2.id))?.status,
      WorkspaceMemberStatus.NeedMoreSeat,
      'should not change status'
    );
  }
});

test('should be able to grant team member permission', async t => {
  const { app, models } = t.context;
  const { owner, teamWorkspace: ws, write, read } = await init(app);

  app.switchUser(read);
  await t.throwsAsync(
    grantMember(app, ws.id, write.id, WorkspaceRole.Collaborator),
    { instanceOf: Error },
    'should throw error if not owner'
  );

  app.switchUser(write);
  await t.throwsAsync(
    grantMember(app, ws.id, read.id, WorkspaceRole.Collaborator),
    { instanceOf: Error },
    'should throw error if not owner'
  );

  {
    // owner should be able to grant permission
    app.switchUser(owner);
    t.true(
      (await models.workspaceUser.get(ws.id, read.id))?.type ===
        WorkspaceRole.Collaborator,
      'should be able to check permission'
    );
    t.truthy(
      await grantMember(app, ws.id, read.id, WorkspaceRole.Admin),
      'should be able to grant permission'
    );
    t.true(
      (await models.workspaceUser.get(ws.id, read.id))?.type ===
        WorkspaceRole.Admin,
      'should be able to check permission'
    );
  }
});

test('should be able to leave workspace', async t => {
  const { app } = t.context;
  const { owner, teamWorkspace: ws, admin, write, read } = await init(app);

  app.switchUser(owner);
  await t.throwsAsync(leaveWorkspace(app, ws.id), {
    message: 'Owner can not leave the workspace.',
  });

  app.switchUser(admin);
  t.true(
    await leaveWorkspace(app, ws.id),
    'admin should be able to leave workspace'
  );

  app.switchUser(write);
  t.true(
    await leaveWorkspace(app, ws.id),
    'write should be able to leave workspace'
  );

  app.switchUser(read);
  t.true(
    await leaveWorkspace(app, ws.id),
    'read should be able to leave workspace'
  );
});

test('should be able to revoke team member', async t => {
  const { app } = t.context;
  const { teamWorkspace: ws, owner, admin, write, read } = await init(app);

  {
    // no permission
    app.switchUser(read);
    await t.throwsAsync(
      revokeUser(app, ws.id, read.id),
      { instanceOf: Error },
      'should throw error if not admin'
    );
    await t.throwsAsync(
      revokeUser(app, ws.id, write.id),
      { instanceOf: Error },
      'should throw error if not admin'
    );
  }

  {
    // manager
    app.switchUser(admin);
    t.true(
      await revokeUser(app, ws.id, read.id),
      'admin should be able to revoke member'
    );

    await t.throwsAsync(
      revokeUser(app, ws.id, admin.id),
      { instanceOf: Error },
      'should not be able to revoke themselves'
    );

    app.switchUser(owner);
    t.true(
      await revokeUser(app, ws.id, write.id),
      'owner should be able to revoke member'
    );

    await t.throwsAsync(revokeUser(app, ws.id, owner.id), {
      message: 'You can not revoke your own permission.',
    });

    await revokeUser(app, ws.id, admin.id);
    app.switchUser(admin);
    await t.throwsAsync(
      revokeUser(app, ws.id, read.id),
      { instanceOf: Error },
      'should not be able to revoke member not in workspace after revoked'
    );
  }
});

test('should be able to manage invite link', async t => {
  const { app } = t.context;
  const {
    workspace: ws,
    teamWorkspace: tws,
    owner,
    admin,
    write,
    read,
  } = await init(app);

  for (const [workspace, managers] of [
    [ws, [owner]],
    [tws, [owner, admin]],
  ] as const) {
    for (const manager of managers) {
      app.switchUser(manager.id);
      const { link } = await createInviteLink(app, workspace.id, 'OneDay');
      const { link: currLink } = await getInviteLink(app, workspace.id);
      t.is(link, currLink, 'should be able to get invite link');

      t.true(
        await revokeInviteLink(app, workspace.id),
        'should be able to revoke invite link'
      );
    }

    for (const collaborator of [write, read]) {
      app.switchUser(collaborator.id);
      await t.throwsAsync(
        createInviteLink(app, workspace.id, 'OneDay'),
        { instanceOf: Error },
        'should throw error if not manager'
      );
      await t.throwsAsync(
        getInviteLink(app, workspace.id),
        { instanceOf: Error },
        'should throw error if not manager'
      );
      await t.throwsAsync(
        revokeInviteLink(app, workspace.id),
        { instanceOf: Error },
        'should throw error if not manager'
      );
    }
  }
});

test('should be able to approve team member', async t => {
  const { app } = t.context;
  const { teamWorkspace: tws, owner, admin, write, read } = await init(app, 6);

  {
    app.switchUser(owner);
    const { link } = await createInviteLink(app, tws.id, 'OneDay');
    const inviteId = link.split('/').pop()!;

    const member = await app.signupV1('newmember@affine.pro');
    t.true(
      await acceptInviteById(app, tws.id, inviteId, false),
      'should be able to accept invite'
    );

    app.switchUser(owner);
    const { members } = await getWorkspace(app, tws.id);
    const memberInvite = members.find(m => m.id === member.id)!;
    t.is(memberInvite.status, 'UnderReview', 'should be under review');

    t.true(await approveMember(app, tws.id, member.id));
  }

  {
    app.switchUser(admin);
    await t.throwsAsync(
      approveMember(app, tws.id, 'not_exists_id'),
      { instanceOf: Error },
      'should throw error if member not exists'
    );

    app.switchUser(write);
    await t.throwsAsync(
      approveMember(app, tws.id, 'not_exists_id'),
      { instanceOf: Error },
      'should throw error if not manager'
    );

    app.switchUser(read);
    await t.throwsAsync(
      approveMember(app, tws.id, 'not_exists_id'),
      { instanceOf: Error },
      'should throw error if not manager'
    );
  }
});

test('should be able to invite by link', async t => {
  const { app, models } = t.context;
  const {
    createInviteLink,
    owner,
    workspace: ws,
    teamWorkspace: tws,
  } = await init(app, 5);
  const [inviteId, invite] = await createInviteLink(ws);
  const [teamInviteId, teamInvite, acceptTeamInvite] =
    await createInviteLink(tws);

  {
    // check invite link
    app.switchUser(owner);
    const info = await getInviteInfo(app, inviteId);
    t.is(info.workspace.id, ws.id, 'should be able to get invite info');

    // check team invite link
    const teamInfo = await getInviteInfo(app, teamInviteId);
    t.is(teamInfo.workspace.id, tws.id, 'should be able to get invite info');
  }

  {
    // invite link
    for (const [i] of Array.from({ length: 5 }).entries()) {
      const user = await invite(`test${i}@affine.pro`);
      const status = (await models.workspaceUser.get(ws.id, user.id))?.status;
      t.is(
        status,
        WorkspaceMemberStatus.UnderReview,
        'should be able to check status'
      );
    }

    await t.throwsAsync(
      invite('exceed@affine.pro'),
      { message: 'You have exceeded your workspace member quota.' },
      'should throw error if exceed member limit'
    );
  }

  {
    // team invite link
    const members: User[] = [];
    await t.notThrowsAsync(async () => {
      members.push(await teamInvite('member3@affine.pro'));
      members.push(await teamInvite('member4@affine.pro'));
    }, 'should not throw error even exceed member limit');
    const [m3, m4] = members;

    t.is(
      (await models.workspaceUser.get(tws.id, m3.id))?.status,
      WorkspaceMemberStatus.NeedMoreSeatAndReview,
      'should not change status'
    );
    t.is(
      (await models.workspaceUser.get(tws.id, m4.id))?.status,
      WorkspaceMemberStatus.NeedMoreSeatAndReview,
      'should not change status'
    );

    models.workspaceFeature.add(tws.id, 'team_plan_v1', 'test', {
      memberLimit: 6,
    });
    await models.workspaceUser.refresh(tws.id, 6);
    t.is(
      (await models.workspaceUser.get(tws.id, m3.id))?.status,
      WorkspaceMemberStatus.UnderReview,
      'should not change status'
    );
    t.is(
      (await models.workspaceUser.get(tws.id, m4.id))?.status,
      WorkspaceMemberStatus.NeedMoreSeatAndReview,
      'should not change status'
    );

    models.workspaceFeature.add(tws.id, 'team_plan_v1', 'test', {
      memberLimit: 7,
    });
    await models.workspaceUser.refresh(tws.id, 7);
    t.is(
      (await models.workspaceUser.get(tws.id, m4.id))?.status,
      WorkspaceMemberStatus.UnderReview,
      'should not change status'
    );

    {
      await t.throwsAsync(acceptTeamInvite(owner.id), {
        message: `You have already joined in Space ${tws.id}.`,
      });
    }
  }
});

test('should be able to send mails', async t => {
  const { app } = t.context;
  const { inviteBatch } = await init(app, 5);

  await inviteBatch(['m3@affine.pro', 'm4@affine.pro'], true);
  t.is(app.mails.count('MemberInvitation'), 2);
});

test('should be able to emit events', async t => {
  const { app, event } = t.context;

  {
    const { teamWorkspace: tws, inviteBatch } = await init(app, 5);

    await inviteBatch(['m1@affine.pro', 'm2@affine.pro']);
    const [membersUpdated] = event.emit
      .getCalls()
      .map(call => call.args)
      .toReversed();
    t.deepEqual(membersUpdated, [
      'workspace.members.updated',
      {
        workspaceId: tws.id,
        count: 7,
      },
    ]);
  }

  {
    const { teamWorkspace: tws, owner, createInviteLink } = await init(app);
    const [, invite] = await createInviteLink(tws);
    const user = await invite('m3@affine.pro');
    app.switchUser(owner);
    const { members } = await getWorkspace(app, tws.id);
    const memberInvite = members.find(m => m.id === user.id)!;
    t.deepEqual(
      event.emit.lastCall.args,
      [
        'workspace.members.reviewRequested',
        { inviteId: memberInvite.inviteId },
      ],
      'should emit review requested event'
    );

    app.switchUser(owner);
    await revokeUser(app, tws.id, user.id);
    t.deepEqual(
      event.emit.lastCall.args,
      [
        'workspace.members.requestDeclined',
        { userId: user.id, workspaceId: tws.id },
      ],
      'should emit review requested event'
    );
  }

  {
    const { teamWorkspace: tws, owner, read } = await init(app);
    await grantMember(app, tws.id, read.id, WorkspaceRole.Admin);
    t.deepEqual(
      event.emit.lastCall.args,
      [
        'workspace.members.roleChanged',
        {
          userId: read.id,
          workspaceId: tws.id,
          role: WorkspaceRole.Admin,
        },
      ],
      'should emit role changed event'
    );

    await grantMember(app, tws.id, read.id, WorkspaceRole.Owner);
    const [ownershipTransferred] = event.emit
      .getCalls()
      .map(call => call.args)
      .toReversed();
    t.deepEqual(
      ownershipTransferred,
      [
        'workspace.owner.changed',
        { from: owner.id, to: read.id, workspaceId: tws.id },
      ],
      'should emit owner transferred event'
    );

    app.switchUser(read);
    await revokeMember(app, tws.id, owner.id);
    const [memberRemoved, memberUpdated] = event.emit
      .getCalls()
      .map(call => call.args)
      .toReversed();
    t.deepEqual(
      memberRemoved,
      [
        'workspace.members.removed',
        {
          userId: owner.id,
          workspaceId: tws.id,
        },
      ],
      'should emit owner transferred event'
    );
    t.deepEqual(
      memberUpdated,
      [
        'workspace.members.updated',
        {
          count: 4,
          workspaceId: tws.id,
        },
      ],
      'should emit role changed event'
    );
  }
});

test('should be able to grant and revoke users role in page', async t => {
  const { app } = t.context;
  const {
    teamWorkspace: ws,
    admin,
    write,
    read,
    external,
  } = await init(app, 5);
  const docId = nanoid();

  app.switchUser(admin);
  const res = await grantDocUserRoles(
    app,
    ws.id,
    docId,
    [read.id, write.id],
    DocRole.Manager
  );

  t.deepEqual(res, {
    grantDocUserRoles: true,
  });

  // should not downgrade the role if role exists
  {
    await grantDocUserRoles(app, ws.id, docId, [read.id], DocRole.Reader);

    // read still be the Manager of this doc
    app.switchUser(read);
    const res = await grantDocUserRoles(
      app,
      ws.id,
      docId,
      [external.id],
      DocRole.Editor
    );
    t.deepEqual(res, {
      grantDocUserRoles: true,
    });

    app.switchUser(admin);
    const docUsersList = await docGrantedUsersList(app, ws.id, docId);
    t.is(docUsersList.workspace.doc.grantedUsersList.totalCount, 3);
    const externalRole = docUsersList.workspace.doc.grantedUsersList.edges.find(
      (edge: any) => edge.node.user.id === external.id
    )?.node.role;
    t.is(externalRole, DocRole[DocRole.Editor]);
  }
});

test('should be able to change the default role in page', async t => {
  const { app } = t.context;
  const { teamWorkspace: ws, admin } = await init(app, 5);
  const docId = nanoid();
  app.switchUser(admin);
  const res = await updateDocDefaultRole(app, ws.id, docId, DocRole.Reader);

  t.deepEqual(res, {
    updateDocDefaultRole: true,
  });
});

test('default page role should be able to override the workspace role', async t => {
  const { app } = t.context;
  const {
    teamWorkspace: workspace,
    admin,
    read,
    external,
  } = await init(app, 5);

  const docId = nanoid();

  app.switchUser(admin);
  const res = await updateDocDefaultRole(
    app,
    workspace.id,
    docId,
    DocRole.Manager
  );

  t.deepEqual(res, {
    updateDocDefaultRole: true,
  });

  // reader can manage the page if the page default role is Manager
  {
    app.switchUser(read);
    const readerRes = await updateDocDefaultRole(
      app,
      workspace.id,
      docId,
      DocRole.Manager
    );

    t.deepEqual(readerRes, {
      updateDocDefaultRole: true,
    });
  }

  // external can't manage the page even if the page default role is Manager
  {
    app.switchUser(external);
    await t.throwsAsync(
      updateDocDefaultRole(app, workspace.id, docId, DocRole.Manager),
      {
        message: `You do not have permission to perform Doc.Users.Manage action on doc ${docId}.`,
      }
    );
  }
});

test('should be able to grant and revoke doc user role', async t => {
  const { app } = t.context;
  const { teamWorkspace: ws, admin, read, external } = await init(app, 5);
  const docId = nanoid();

  app.switchUser(admin);
  const res = await grantDocUserRoles(
    app,
    ws.id,
    docId,
    [external.id],
    DocRole.Manager
  );

  t.deepEqual(res, {
    grantDocUserRoles: true,
  });

  // external user can never be able to manage the page
  {
    app.switchUser(external);
    await t.throwsAsync(
      grantDocUserRoles(app, ws.id, docId, [read.id], DocRole.Manager),
      {
        message: `You do not have permission to perform Doc.Users.Manage action on doc ${docId}.`,
      }
    );
  }

  // revoke the role of the external user
  {
    app.switchUser(admin);
    const revokeRes = await revokeDocUserRoles(app, ws.id, docId, external.id);

    t.deepEqual(revokeRes, {
      revokeDocUserRoles: true,
    });

    // external user can't manage the page
    app.switchUser(external);
    await t.throwsAsync(revokeDocUserRoles(app, ws.id, docId, read.id), {
      message: `You do not have permission to perform Doc.Users.Manage action on doc ${docId}.`,
    });
  }
});

test('update page default role should throw error if the space does not exist', async t => {
  const { app } = t.context;
  const { admin } = await init(app, 5);
  const docId = nanoid();
  const nonExistWorkspaceId = 'non-exist-workspace';
  app.switchUser(admin);
  await t.throwsAsync(
    updateDocDefaultRole(app, nonExistWorkspaceId, docId, DocRole.Manager),
    {
      message: `You do not have permission to perform Doc.Users.Manage action on doc ${docId}.`,
    }
  );
});
