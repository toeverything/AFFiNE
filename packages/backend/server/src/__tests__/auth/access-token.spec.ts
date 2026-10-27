import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';

import {
  AccessTokenService,
  AuthModule,
  AuthSessionService,
  AuthSigningKeyRing,
  SessionAccessTokenError,
} from '../../core/auth';
import { createTestingApp, TestingApp } from '../utils';

const test = ava.serial as TestFn<{
  app: TestingApp;
  access: AccessTokenService;
  sessions: AuthSessionService;
  keys: AuthSigningKeyRing;
  db: PrismaClient;
}>;

test.before(async t => {
  const app = await createTestingApp({ imports: [AuthModule] });
  t.context.app = app;
  t.context.access = app.get(AccessTokenService);
  t.context.sessions = app.get(AuthSessionService);
  t.context.keys = app.get(AuthSigningKeyRing);
  t.context.db = app.get(PrismaClient);
});

test.beforeEach(async t => {
  await t.context.app.initTestingDB();
});

test.after.always(async t => {
  await t.context.app.close();
});

test('native access-token verifier returns the canonical principal', async t => {
  const user = await t.context.app.createUser('access-token@affine.pro');
  const issued = await t.context.app.createNativeAuthSession(user.id, {
    installationId: 'access-installation',
    platform: 'android',
  });
  t.regex(issued.accessToken, /^eyJ/);

  const principal = await t.context.access.verify(issued.accessToken);
  t.is(principal.user.id, user.id);
  t.is(principal.authSessionId, issued.session.id);
  t.true(principal.authenticatedAt instanceof Date);

  const error = await t.throwsAsync(() => t.context.access.verify('not-jwt'));
  t.true(error instanceof SessionAccessTokenError);
  t.is((error as SessionAccessTokenError).code, 'ACCESS_TOKEN_INVALID');
});

test('retiring keys verify old tokens while session state remains authoritative', async t => {
  const user = await t.context.app.createUser('rotated-token@affine.pro');
  const issued = await t.context.app.createNativeAuthSession(user.id);
  const active = (await t.context.keys.metadata()).find(
    key => key.status === 'active'
  );
  t.truthy(active);
  if (!active) return;
  await t.context.keys.rotate(user.id, active.id);
  t.is((await t.context.access.verify(issued.accessToken)).user.id, user.id);

  await t.context.sessions.revoke(issued.session.id, 'test', user.id);
  const error = await t.throwsAsync(() =>
    t.context.access.verify(issued.accessToken)
  );
  t.is((error as SessionAccessTokenError).code, 'AUTH_SESSION_REVOKED');
});

test('expired parent cookie lifetime invalidates native access tokens', async t => {
  const user = await t.context.app.createUser('expired-token@affine.pro');
  const issued = await t.context.app.createNativeAuthSession(user.id);
  await t.context.db.userSession.updateMany({
    where: { userId: user.id },
    data: { expiresAt: new Date(0) },
  });
  const error = await t.throwsAsync(() =>
    t.context.access.verify(issued.accessToken)
  );
  t.is((error as SessionAccessTokenError).code, 'AUTH_SESSION_EXPIRED');
});
