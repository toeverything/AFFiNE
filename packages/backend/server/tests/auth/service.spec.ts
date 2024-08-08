import { TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';

import { CurrentUser } from '../../src/core/auth';
import { AuthService, parseAuthUserSeqNum } from '../../src/core/auth/service';
import { FeatureModule } from '../../src/core/features';
import { QuotaModule } from '../../src/core/quota';
import { UserModule, UserService } from '../../src/core/user';
import { createTestingModule } from '../utils';

const test = ava as TestFn<{
  auth: AuthService;
  user: UserService;
  u1: CurrentUser;
  db: PrismaClient;
  m: TestingModule;
}>;

test.beforeEach(async t => {
  const m = await createTestingModule({
    imports: [QuotaModule, FeatureModule, UserModule],
    providers: [AuthService],
  });

  t.context.auth = m.get(AuthService);
  t.context.user = m.get(UserService);
  t.context.db = m.get(PrismaClient);
  t.context.m = m;

  t.context.u1 = await t.context.auth.signUp('u1', 'u1@affine.pro', '1');
});

test.afterEach.always(async t => {
  await t.context.m.close();
});

test('should be able to parse auth user seq num', t => {
  t.deepEqual(
    [
      '1',
      '2',
      3,
      -3,
      '-4',
      '1.1',
      'str',
      '1111111111111111111111111111111111111111111',
    ].map(parseAuthUserSeqNum),
    [1, 2, 3, 0, 0, 0, 0, 0]
  );
});

test('should be able to sign up', async t => {
  const { auth } = t.context;
  const u2 = await auth.signUp('u2', 'u2@affine.pro', '1');

  t.is(u2.email, 'u2@affine.pro');

  const signedU2 = await auth.signIn(u2.email, '1');

  t.is(u2.email, signedU2.email);
});

test('should throw if email duplicated', async t => {
  const { auth } = t.context;

  await t.throwsAsync(() => auth.signUp('u1', 'u1@affine.pro', '1'), {
    message: 'This email has already been registered.',
  });
});

test('should be able to sign in', async t => {
  const { auth } = t.context;

  const signedInUser = await auth.signIn('u1@affine.pro', '1');

  t.is(signedInUser.email, 'u1@affine.pro');
});

test('should throw if user not found', async t => {
  const { auth } = t.context;

  await t.throwsAsync(() => auth.signIn('u2@affine.pro', '1'), {
    message: 'Wrong user email or password.',
  });
});

test('should throw if password not set', async t => {
  const { user, auth } = t.context;

  await user.createUser({
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
    message: 'Wrong user email or password.',
  });
});

test('should be able to change password', async t => {
  const { auth, u1 } = t.context;

  let signedInU1 = await auth.signIn('u1@affine.pro', '1');
  t.is(signedInU1.email, u1.email);

  await auth.changePassword(u1.id, '2');

  await t.throwsAsync(
    () => auth.signIn('u1@affine.pro', '1' /* old password */),
    {
      message: 'Wrong user email or password.',
    }
  );

  signedInU1 = await auth.signIn('u1@affine.pro', '2');
  t.is(signedInU1.email, u1.email);
});

test('should be able to change email', async t => {
  const { auth, u1 } = t.context;

  let signedInU1 = await auth.signIn('u1@affine.pro', '1');
  t.is(signedInU1.email, u1.email);

  await auth.changeEmail(u1.id, 'u2@affine.pro');

  await t.throwsAsync(() => auth.signIn('u1@affine.pro' /* old email */, '1'), {
    message: 'Wrong user email or password.',
  });

  signedInU1 = await auth.signIn('u2@affine.pro', '1');
  t.is(signedInU1.email, 'u2@affine.pro');
});

// Tests for Session
test('should be able to create user session', async t => {
  const { auth, u1 } = t.context;

  const session = await auth.createUserSession(u1);

  t.is(session.userId, u1.id);
});

test('should be able to get user from session', async t => {
  const { auth, u1 } = t.context;

  const session = await auth.createUserSession(u1);

  const userSession = await auth.getUserSession(session.sessionId);

  t.not(userSession, null);
  t.is(userSession!.user.id, u1.id);
});

test('should be able to sign out session', async t => {
  const { auth, u1 } = t.context;

  const session = await auth.createUserSession(u1);

  const signedOutSession = await auth.signOut(session.sessionId);

  t.is(signedOutSession, null);
});

// Tests for Multi-Accounts Session
test('should be able to sign in different user in a same session', async t => {
  const { auth, u1 } = t.context;

  const u2 = await auth.signUp('u2', 'u2@affine.pro', '1');

  const session = await auth.createUserSession(u1);
  await auth.createUserSession(u2, session.sessionId);

  const [signedU1, signedU2] = await auth.getUserList(session.sessionId);

  t.not(signedU1, null);
  t.not(signedU2, null);
  t.is(signedU1!.id, u1.id);
  t.is(signedU2!.id, u2.id);
});

test('should be able to signout multi accounts session', async t => {
  const { auth, u1 } = t.context;

  const u2 = await auth.signUp('u2', 'u2@affine.pro', '1');

  const session = await auth.createUserSession(u1);
  await auth.createUserSession(u2, session.sessionId);

  // sign out user at seq(0)
  let signedOutSession = await auth.signOut(session.sessionId);

  t.not(signedOutSession, null);

  const userSession1 = await auth.getUserSession(session.sessionId, 0);
  const userSession2 = await auth.getUserSession(session.sessionId, 1);

  t.is(userSession2, null);
  t.not(userSession1, null);

  t.is(userSession1!.user.id, u2.id);

  // sign out user at seq(0)
  signedOutSession = await auth.signOut(session.sessionId);

  t.is(signedOutSession, null);

  const userSession3 = await auth.getUserSession(session.sessionId, 0);
  t.is(userSession3, null);
});
