import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';

import { CurrentUser } from '../../core/auth';
import { AuthService } from '../../core/auth/service';
import { EntitlementModule } from '../../core/entitlement';
import { FeatureModule } from '../../core/features';
import { QuotaModule } from '../../core/quota';
import { UserModule } from '../../core/user';
import { Models } from '../../models';
import { createTestingModule, type TestingModule } from '../utils';

const test = ava.serial as TestFn<{
  auth: AuthService;
  u1: CurrentUser;
  db: PrismaClient;
  models: Models;
  m: TestingModule;
}>;

test.before(async t => {
  const m = await createTestingModule({
    imports: [EntitlementModule, QuotaModule, FeatureModule, UserModule],
    providers: [AuthService],
  });

  t.context.auth = m.get(AuthService);
  t.context.db = m.get(PrismaClient);
  t.context.models = m.get(Models);
  t.context.m = m;
});

test.beforeEach(async t => {
  await t.context.m.initTestingDB();
  t.context.u1 = await t.context.models.user
    .create({ email: 'u1@affine.pro', password: '1' })
    .then(user => ({
      ...user,
      hasPassword: true,
      emailVerified: user.emailVerifiedAt !== null,
    }));
});

test.after.always(async t => {
  await t.context.m.close();
});

// Tests for Session
test('should be able to create user session', async t => {
  const { auth, u1 } = t.context;

  const session = await auth.issueUser(u1.id, { type: 'cookie' });

  t.is(session.user.id, u1.id);
});

test('should be able to get user from session', async t => {
  const { auth, u1 } = t.context;

  const session = await auth.issueUser(u1.id, { type: 'cookie' });

  const userSession = await auth.getUserSession(session.sessionId!);

  t.not(userSession, null);
  t.is(userSession!.user.id, u1.id);
});

test('should be able to sign out session', async t => {
  const { auth, u1 } = t.context;

  const session = await auth.issueUser(u1.id, { type: 'cookie' });
  await auth.signOut(session.sessionId!);
  const userSession = await auth.getUserSession(session.sessionId!);

  t.is(userSession, null);
});

test('should not return expired session', async t => {
  const { auth, u1, db } = t.context;

  const session = await auth.issueUser(u1.id, { type: 'cookie' });
  const row = await db.userSession.findUniqueOrThrow({
    where: {
      sessionId_userId: { sessionId: session.sessionId!, userId: u1.id },
    },
  });

  await db.userSession.update({
    where: { id: row.id },
    data: {
      expiresAt: new Date(Date.now() - 1000),
    },
  });

  const userSession = await auth.getUserSession(session.sessionId!);
  t.is(userSession, null);
});

// Tests for Multi-Accounts Session
test('should be able to sign in different user in a same session', async t => {
  const { auth, u1 } = t.context;

  const u2 = await t.context.models.user.create({
    email: 'u2@affine.pro',
    password: '1',
  });

  const first = await auth.issueUser(u1.id, { type: 'cookie' });
  const sessionId = first.sessionId!;

  let userList = await auth.getUserList(sessionId);
  t.is(userList.length, 1);
  t.is(userList[0]!.id, u1.id);

  await auth.issueUser(u2.id, { type: 'cookie', sessionId });

  userList = await auth.getUserList(sessionId);

  t.is(userList.length, 2);

  const [signedU1, signedU2] = userList;

  t.not(signedU1, null);
  t.not(signedU2, null);
  t.is(signedU1!.id, u1.id);
  t.is(signedU2!.id, u2.id);
});

test('should be able to signout multi accounts session', async t => {
  const { auth, u1 } = t.context;

  const u2 = await t.context.models.user.create({
    email: 'u2@affine.pro',
    password: '1',
  });

  const userSession1 = await auth.issueUser(u1.id, { type: 'cookie' });
  const sessionId = userSession1.sessionId!;
  const userSession2 = await auth.issueUser(u2.id, {
    type: 'cookie',
    sessionId,
  });
  t.is(userSession1.sessionId, userSession2.sessionId);

  await auth.signOut(sessionId, u1.id);

  let list = await auth.getUserList(sessionId);

  t.is(list.length, 1);
  t.is(list[0]!.id, u2.id);

  const u2Session = await auth.getUserSession(sessionId, u1.id);

  t.is(u2Session?.session.sessionId, sessionId);
  t.is(u2Session?.user.id, u2.id);

  await auth.signOut(sessionId, u2.id);
  list = await auth.getUserList(sessionId);

  t.is(list.length, 0);

  const nullSession = await auth.getUserSession(sessionId, u2.id);

  t.is(nullSession, null);
});
