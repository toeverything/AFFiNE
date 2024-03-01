import {
  getCurrentMailMessageCount,
  getLatestMailMessage,
} from '@affine-test/kit/utils/cloud';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import ava, { type TestFn } from 'ava';

import { AppModule } from '../src/app.module';
import { AuthService } from '../src/core/auth/service';
import { MailService } from '../src/fundamentals/mailer';
import {
  acceptInviteById,
  createTestingApp,
  createWorkspace,
  getWorkspace,
  inviteUser,
  leaveWorkspace,
  revokeUser,
  signUp,
} from './utils';

const test = ava as TestFn<{
  app: INestApplication;
  client: PrismaClient;
  auth: AuthService;
  mail: MailService;
}>;

test.beforeEach(async t => {
  const { app } = await createTestingApp({
    imports: [AppModule],
  });
  t.context.app = app;
  t.context.client = app.get(PrismaClient);
  t.context.auth = app.get(AuthService);
  t.context.mail = app.get(MailService);
});

test.afterEach.always(async t => {
  await t.context.app.close();
});

test('should invite a user', async t => {
  const { app } = t.context;
  const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');
  const u2 = await signUp(app, 'u2', 'u2@affine.pro', '1');

  const workspace = await createWorkspace(app, u1.token.token);

  const invite = await inviteUser(
    app,
    u1.token.token,
    workspace.id,
    u2.email,
    'Admin'
  );
  t.truthy(invite, 'failed to invite user');
});

test('should leave a workspace', async t => {
  const { app } = t.context;
  const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');
  const u2 = await signUp(app, 'u2', 'u2@affine.pro', '1');

  const workspace = await createWorkspace(app, u1.token.token);
  const id = await inviteUser(
    app,
    u1.token.token,
    workspace.id,
    u2.email,
    'Admin'
  );
  await acceptInviteById(app, workspace.id, id, false);

  const leave = await leaveWorkspace(app, u2.token.token, workspace.id);

  t.pass();
  t.true(leave, 'failed to leave workspace');
});

test('should revoke a user', async t => {
  const { app } = t.context;
  const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');
  const u2 = await signUp(app, 'u2', 'u2@affine.pro', '1');

  const workspace = await createWorkspace(app, u1.token.token);
  await inviteUser(app, u1.token.token, workspace.id, u2.email, 'Admin');

  const currWorkspace = await getWorkspace(app, u1.token.token, workspace.id);
  t.is(currWorkspace.members.length, 2, 'failed to invite user');

  const revoke = await revokeUser(app, u1.token.token, workspace.id, u2.id);
  t.true(revoke, 'failed to revoke user');
});

test('should create user if not exist', async t => {
  const { app, auth } = t.context;
  const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');

  const workspace = await createWorkspace(app, u1.token.token);

  await inviteUser(app, u1.token.token, workspace.id, 'u2@affine.pro', 'Admin');

  const user = await auth.getUserByEmail('u2@affine.pro');
  t.not(user, undefined, 'failed to create user');
  t.is(user?.name, 'u2', 'failed to create user');
});

test('should invite a user by link', async t => {
  const { app } = t.context;
  const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');
  const u2 = await signUp(app, 'u2', 'u2@affine.pro', '1');

  const workspace = await createWorkspace(app, u1.token.token);

  const invite = await inviteUser(
    app,
    u1.token.token,
    workspace.id,
    u2.email,
    'Admin'
  );

  const accept = await acceptInviteById(app, workspace.id, invite);
  t.true(accept, 'failed to accept invite');

  const invite1 = await inviteUser(
    app,
    u1.token.token,
    workspace.id,
    u2.email,
    'Admin'
  );

  t.is(invite, invite1, 'repeat the invitation must return same id');

  const currWorkspace = await getWorkspace(app, u1.token.token, workspace.id);
  const currMember = currWorkspace.members.find(u => u.email === u2.email);
  t.not(currMember, undefined, 'failed to invite user');
  t.is(currMember?.inviteId, invite, 'failed to check invite id');
});

test('should send email', async t => {
  const { mail, app } = t.context;
  if (mail.hasConfigured()) {
    const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');
    const u2 = await signUp(app, 'test', 'production@toeverything.info', '1');

    const workspace = await createWorkspace(app, u1.token.token);
    const primitiveMailCount = await getCurrentMailMessageCount();

    const invite = await inviteUser(
      app,
      u1.token.token,
      workspace.id,
      u2.email,
      'Admin',
      true
    );

    const afterInviteMailCount = await getCurrentMailMessageCount();
    t.is(
      primitiveMailCount + 1,
      afterInviteMailCount,
      'failed to send invite email'
    );
    const inviteEmailContent = await getLatestMailMessage();

    t.not(
      inviteEmailContent.To.find((item: any) => {
        return item.Mailbox === 'production';
      }),
      undefined,
      'invite email address was incorrectly sent'
    );

    const accept = await acceptInviteById(app, workspace.id, invite, true);
    t.true(accept, 'failed to accept invite');

    const afterAcceptMailCount = await getCurrentMailMessageCount();
    t.is(
      afterInviteMailCount + 1,
      afterAcceptMailCount,
      'failed to send accepted email to owner'
    );
    const acceptEmailContent = await getLatestMailMessage();
    t.not(
      acceptEmailContent.To.find((item: any) => {
        return item.Mailbox === 'u1';
      }),
      undefined,
      'accept email address was incorrectly sent'
    );

    await leaveWorkspace(app, u2.token.token, workspace.id, true);

    const afterLeaveMailCount = await getCurrentMailMessageCount();
    t.is(
      afterAcceptMailCount + 1,
      afterLeaveMailCount,
      'failed to send leave email to owner'
    );
    const leaveEmailContent = await getLatestMailMessage();
    t.not(
      leaveEmailContent.To.find((item: any) => {
        return item.Mailbox === 'u1';
      }),
      undefined,
      'leave email address was incorrectly sent'
    );
  }
  t.pass();
});

test('should support pagination for member', async t => {
  const { app } = t.context;
  const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');
  const u2 = await signUp(app, 'u2', 'u2@affine.pro', '1');
  const u3 = await signUp(app, 'u3', 'u3@affine.pro', '1');

  const workspace = await createWorkspace(app, u1.token.token);
  const invite1 = await inviteUser(
    app,
    u1.token.token,
    workspace.id,
    u2.email,
    'Admin'
  );
  const invite2 = await inviteUser(
    app,
    u1.token.token,
    workspace.id,
    u3.email,
    'Admin'
  );

  await acceptInviteById(app, workspace.id, invite1, false);
  await acceptInviteById(app, workspace.id, invite2, false);

  const firstPageWorkspace = await getWorkspace(
    app,
    u1.token.token,
    workspace.id,
    0,
    2
  );
  t.is(firstPageWorkspace.members.length, 2, 'failed to check invite id');
  const secondPageWorkspace = await getWorkspace(
    app,
    u1.token.token,
    workspace.id,
    2,
    2
  );
  t.is(secondPageWorkspace.members.length, 1, 'failed to check invite id');
});

test('should limit member count correctly', async t => {
  const { app } = t.context;
  const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');
  for (let i = 0; i < 10; i++) {
    const workspace = await createWorkspace(app, u1.token.token);
    const ret = await Promise.allSettled(
      Array.from({ length: 10 }).map(async (_, i) =>
        inviteUser(
          app,
          u1.token.token,
          workspace.id,
          `u${i}@affine.pro`,
          'Admin'
        )
      )
    );
    t.is(
      ret.filter(r => r.status === 'fulfilled').length,
      3,
      'failed to limit invite count'
    );

    const ws = await getWorkspace(app, u1.token.token, workspace.id);
    t.is(ws.members.length, 3, 'failed to check member list');
  }
});
