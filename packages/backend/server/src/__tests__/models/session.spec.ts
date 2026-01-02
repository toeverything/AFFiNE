import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';

import { Config } from '../../base/config';
import { SessionModel } from '../../models/session';
import { UserModel } from '../../models/user';
import { createTestingModule, type TestingModule } from '../utils';

interface Context {
  config: Config;
  module: TestingModule;
  db: PrismaClient;
  session: SessionModel;
  user: UserModel;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule({});

  t.context.session = module.get(SessionModel);
  t.context.user = module.get(UserModel);
  t.context.db = module.get(PrismaClient);
  t.context.config = module.get(Config);
  t.context.module = module;
});

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
});

test.after(async t => {
  await t.context.module.close();
});

test('should create a new session', async t => {
  const session = await t.context.session.createSession();
  t.truthy(session.id);
  t.truthy(session.createdAt);
});

test('should get a exists session', async t => {
  const session = await t.context.session.createSession();
  const existsSession = await t.context.session.getSession(session.id);
  t.deepEqual(session, existsSession);
});

test('should get null when session id not exists', async t => {
  const session = await t.context.session.getSession('not-exists');
  t.is(session, null);
});

test('should delete a exists session', async t => {
  const session = await t.context.session.createSession();
  const count = await t.context.session.deleteSession(session.id);
  t.is(count, 1);
  const existsSession = await t.context.session.getSession(session.id);
  t.is(existsSession, null);
});

test('should not delete a not exists session', async t => {
  const count = await t.context.session.deleteSession('not-exists');
  t.is(count, 0);
});

test('should create a new userSession', async t => {
  const user = await t.context.user.create({
    email: 'test@affine.pro',
  });
  const session = await t.context.db.session.create({
    data: {},
  });
  const userSession = await t.context.session.createOrRefreshUserSession(
    user.id,
    session.id
  );
  t.is(userSession.sessionId, session.id);
  t.is(userSession.userId, user.id);
  t.not(userSession.expiresAt, null);
});

test('should auto create a new session when sessionId not exists in database', async t => {
  const user = await t.context.user.create({
    email: 'test@affine.pro',
  });
  const userSession = await t.context.session.createOrRefreshUserSession(
    user.id,
    'not-exists-session-id'
  );
  t.not(userSession.sessionId, 'not-exists-session-id');
  t.truthy(userSession.sessionId);
  t.is(userSession.userId, user.id);
  t.not(userSession.expiresAt, null);
});

test('should refresh exists userSession', async t => {
  const user = await t.context.user.create({
    email: 'test@affine.pro',
  });
  const session = await t.context.db.session.create({
    data: {},
  });
  const userSession = await t.context.session.createOrRefreshUserSession(
    user.id,
    session.id
  );
  t.is(userSession.sessionId, session.id);
  t.is(userSession.userId, user.id);
  t.not(userSession.expiresAt, null);

  const existsUserSession = await t.context.session.createOrRefreshUserSession(
    user.id,
    session.id
  );
  t.is(existsUserSession.sessionId, session.id);
  t.is(existsUserSession.userId, user.id);
  t.not(existsUserSession.expiresAt, null);
  t.is(existsUserSession.id, userSession.id);
  t.assert(
    existsUserSession.expiresAt!.getTime() > userSession.expiresAt!.getTime()
  );
});

test('should not refresh userSession when expires time not hit ttr', async t => {
  const user = await t.context.user.create({
    email: 'test@affine.pro',
  });
  const session = await t.context.db.session.create({
    data: {},
  });
  const userSession = await t.context.session.createOrRefreshUserSession(
    user.id,
    session.id
  );
  let newExpiresAt =
    await t.context.session.refreshUserSessionIfNeeded(userSession);
  t.is(newExpiresAt, undefined);
  userSession.expiresAt = new Date(
    userSession.expiresAt!.getTime() - t.context.config.auth.session.ttr * 1000
  );
  newExpiresAt =
    await t.context.session.refreshUserSessionIfNeeded(userSession);
  t.is(newExpiresAt, undefined);
});

test('should not refresh userSession when expires time hit ttr', async t => {
  const user = await t.context.user.create({
    email: 'test@affine.pro',
  });
  const session = await t.context.session.createSession();
  const userSession = await t.context.session.createOrRefreshUserSession(
    user.id,
    session.id
  );
  const ttr = t.context.config.auth.session.ttr * 2;
  userSession.expiresAt = new Date(
    userSession.expiresAt!.getTime() - ttr * 1000
  );
  const newExpiresAt =
    await t.context.session.refreshUserSessionIfNeeded(userSession);
  t.not(newExpiresAt, undefined);
});

test('should find userSessions without user property by default', async t => {
  const session = await t.context.db.session.create({
    data: {},
  });
  const count = 10;
  for (let i = 0; i < count; i++) {
    const user = await t.context.user.create({
      email: `test${i}@affine.pro`,
    });
    await t.context.session.createOrRefreshUserSession(user.id, session.id);
  }
  const userSessions = await t.context.session.findUserSessionsBySessionId(
    session.id
  );
  t.is(userSessions.length, count);
  for (const userSession of userSessions) {
    t.is(userSession.sessionId, session.id);
    t.is(Reflect.get(userSession, 'user'), undefined);
  }
});

test('should find userSessions include user property', async t => {
  const session = await t.context.db.session.create({
    data: {},
  });
  const count = 10;
  for (let i = 0; i < count; i++) {
    const user = await t.context.user.create({
      email: `test${i}@affine.pro`,
    });
    await t.context.session.createOrRefreshUserSession(user.id, session.id);
  }
  const userSessions = await t.context.session.findUserSessionsBySessionId(
    session.id,
    { user: true }
  );
  t.is(userSessions.length, count);
  for (const userSession of userSessions) {
    t.is(userSession.sessionId, session.id);
    t.truthy(userSession.user.id);
  }
});

test('should delete userSession success by userId', async t => {
  const user = await t.context.user.create({
    email: 'test@affine.pro',
  });
  const session = await t.context.db.session.create({
    data: {},
  });
  await t.context.session.createOrRefreshUserSession(user.id, session.id);
  let count = await t.context.session.deleteUserSessions(user.id);
  t.is(count, 1);
  count = await t.context.session.deleteUserSessions(user.id);
  t.is(count, 0);
});

test('should delete userSession success by userId and sessionId', async t => {
  const user = await t.context.user.create({
    email: 'test@affine.pro',
  });
  const session = await t.context.db.session.create({
    data: {},
  });
  await t.context.session.createOrRefreshUserSession(user.id, session.id);
  const count = await t.context.session.deleteUserSessions(user.id, session.id);
  t.is(count, 1);
});

test('should delete userSession fail when sessionId not match', async t => {
  const user = await t.context.user.create({
    email: 'test@affine.pro',
  });
  const session = await t.context.db.session.create({
    data: {},
  });
  await t.context.session.createOrRefreshUserSession(user.id, session.id);
  const count = await t.context.session.deleteUserSessions(
    user.id,
    'not-exists-session-id'
  );
  t.is(count, 0);
});

test('should cleanup expired userSessions', async t => {
  const user = await t.context.user.create({
    email: 'test@affine.pro',
  });
  const session = await t.context.db.session.create({
    data: {},
  });
  const userSession = await t.context.session.createOrRefreshUserSession(
    user.id,
    session.id
  );
  await t.context.session.cleanExpiredUserSessions();
  let count = await t.context.db.userSession.count();
  t.is(count, 1);

  // Set expiresAt to past time
  await t.context.db.userSession.update({
    where: { id: userSession.id },
    data: { expiresAt: new Date('2022-01-01') },
  });
  await t.context.session.cleanExpiredUserSessions();
  count = await t.context.db.userSession.count();
  t.is(count, 0);
});
