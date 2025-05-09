import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';

import { CurrentUser } from '../../core/auth';
import { AuthService } from '../../core/auth/service';
import { FeatureModule } from '../../core/features';
import { QuotaModule } from '../../core/quota';
import { UserModule } from '../../core/user';
import { Models } from '../../models';
import { createTestingModule, type TestingModule } from '../utils';

const test = ava as TestFn<{
  auth: AuthService;
  models: Models;
  u1: CurrentUser;
  db: PrismaClient;
  m: TestingModule;
}>;

test.before(async t => {
  const m = await createTestingModule({
    imports: [QuotaModule, FeatureModule, UserModule],
    providers: [AuthService],
  });

  t.context.auth = m.get(AuthService);
  t.context.models = m.get(Models);
  t.context.db = m.get(PrismaClient);
  t.context.m = m;
});

test.beforeEach(async t => {
  await t.context.m.initTestingDB();
  t.context.u1 = await t.context.auth.signUp('u1@affine.pro', '1');
});

test.after.always(async t => {
  await t.context.m.close();
});

test('should be able to sign in by password', async t => {
  const { auth } = t.context;

  const signedInUser = await auth.signIn('u1@affine.pro', '1');

  t.is(signedInUser.email, 'u1@affine.pro');
});

test('should throw if user not found', async t => {
  const { auth } = t.context;

  await t.throwsAsync(() => auth.signIn('u2@affine.pro', '1'), {
    message: 'Wrong user email or password: u2@affine.pro',
  });
});

test('should throw if password not set', async t => {
  const { models, auth } = t.context;

  await models.user.create({
    email: 'u2@affine.pro',
    name: 'u2',
  });

  await t.throwsAsync(() => auth.signIn('u2@affine.pro', '1'), {
    message:
      'You are trying to sign in by a different method than you signed up with.',
  });
});

test('should throw if password not match', async t => {
  const { auth } = t.context;

  await t.throwsAsync(() => auth.signIn('u1@affine.pro', '2'), {
    message: 'Wrong user email or password: u1@affine.pro',
  });
});

test('should be able to change password', async t => {
  const { auth, u1 } = t.context;

  let signedInU1 = await auth.signIn('u1@affine.pro', '1');
  t.is(signedInU1.email, u1.email);

  await auth.changePassword(u1.id, 'hello world affine');

  await t.throwsAsync(
    () => auth.signIn('u1@affine.pro', '1' /* old password */),
    {
      message: 'Wrong user email or password: u1@affine.pro',
    }
  );

  signedInU1 = await auth.signIn('u1@affine.pro', 'hello world affine');
  t.is(signedInU1.email, u1.email);
});

test('should be able to change email', async t => {
  const { auth, u1 } = t.context;

  let signedInU1 = await auth.signIn('u1@affine.pro', '1');
  t.is(signedInU1.email, u1.email);

  await auth.changeEmail(u1.id, 'u2@affine.pro');

  await t.throwsAsync(() => auth.signIn('u1@affine.pro' /* old email */, '1'), {
    message: 'Wrong user email or password: u1@affine.pro',
  });

  signedInU1 = await auth.signIn('u2@affine.pro', '1');
  t.is(signedInU1.email, 'u2@affine.pro');
});

// Tests for Session
test('should be able to create user session', async t => {
  const { auth, u1 } = t.context;

  const session = await auth.createUserSession(u1.id);

  t.is(session.userId, u1.id);
});

test('should be able to get user from session', async t => {
  const { auth, u1 } = t.context;

  const session = await auth.createUserSession(u1.id);

  const userSession = await auth.getUserSession(session.sessionId);

  t.not(userSession, null);
  t.is(userSession!.user.id, u1.id);
});

test('should be able to sign out session', async t => {
  const { auth, u1 } = t.context;

  const session = await auth.createUserSession(u1.id);
  await auth.signOut(session.sessionId);
  const userSession = await auth.getUserSession(session.sessionId);

  t.is(userSession, null);
});

test('should not return expired session', async t => {
  const { auth, u1, db } = t.context;

  const session = await auth.createUserSession(u1.id);

  await db.userSession.update({
    where: { id: session.id },
    data: {
      expiresAt: new Date(Date.now() - 1000),
    },
  });

  const userSession = await auth.getUserSession(session.sessionId);
  t.is(userSession, null);
});

// Tests for Multi-Accounts Session
test('should be able to sign in different user in a same session', async t => {
  const { auth, u1 } = t.context;

  const u2 = await auth.signUp('u2@affine.pro', '1');

  const session = await auth.createSession();

  await auth.createUserSession(u1.id, session.id);

  let userList = await auth.getUserList(session.id);
  t.is(userList.length, 1);
  t.is(userList[0]!.id, u1.id);

  await auth.createUserSession(u2.id, session.id);

  userList = await auth.getUserList(session.id);

  t.is(userList.length, 2);

  const [signedU1, signedU2] = userList;

  t.not(signedU1, null);
  t.not(signedU2, null);
  t.is(signedU1!.id, u1.id);
  t.is(signedU2!.id, u2.id);
});

test('should be able to signout multi accounts session', async t => {
  const { auth, u1 } = t.context;

  const u2 = await auth.signUp('u2@affine.pro', '1');

  const session = await auth.createSession();

  const userSession1 = await auth.createUserSession(u1.id, session.id);
  const userSession2 = await auth.createUserSession(u2.id, session.id);
  t.not(userSession1.id, userSession2.id);
  t.is(userSession1.sessionId, userSession2.sessionId);

  await auth.signOut(session.id, u1.id);

  let list = await auth.getUserList(session.id);

  t.is(list.length, 1);
  t.is(list[0]!.id, u2.id);

  const u2Session = await auth.getUserSession(session.id, u1.id);

  t.is(u2Session?.session.sessionId, session.id);
  t.is(u2Session?.user.id, u2.id);

  await auth.signOut(session.id, u2.id);
  list = await auth.getUserList(session.id);

  t.is(list.length, 0);

  const nullSession = await auth.getUserSession(session.id, u2.id);

  t.is(nullSession, null);
});
