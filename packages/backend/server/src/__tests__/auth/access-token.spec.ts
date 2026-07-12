import { PrismaClient } from '@prisma/client';
import ava, { ExecutionContext, TestFn } from 'ava';
import jwt from 'jsonwebtoken';

import { ConfigFactory } from '../../base';
import {
  AccessTokenService,
  AuthModule,
  AuthService,
  AuthSessionService,
  AuthSigningKeyRing,
  type CurrentUser,
} from '../../core/auth';
import { Models } from '../../models';
import { createTestingApp, TestingApp } from '../utils';

const test = ava as TestFn<{
  app: TestingApp;
  auth: AuthService;
  accessTokens: AccessTokenService;
  keys: AuthSigningKeyRing;
  authSessions: AuthSessionService;
  config: ConfigFactory;
  models: Models;
  db: PrismaClient;
  user: CurrentUser;
  sessionId: string;
  userSessionId: string;
  authSessionId: string;
}>;

test.before(async t => {
  const app = await createTestingApp({
    imports: [AuthModule],
  });

  t.context.app = app;
  t.context.auth = app.get(AuthService);
  t.context.accessTokens = app.get(AccessTokenService);
  t.context.keys = app.get(AuthSigningKeyRing);
  t.context.authSessions = app.get(AuthSessionService);
  t.context.config = app.get(ConfigFactory);
  t.context.models = app.get(Models);
  t.context.db = app.get(PrismaClient);
});

test.beforeEach(async t => {
  await t.context.app.initTestingDB();
  resetAuthSessionConfig(t.context.config);

  t.context.user = await t.context.auth.signUp('u1@affine.pro', '1');
  const session = await t.context.auth.createUserSession(t.context.user.id);
  t.context.sessionId = session.sessionId;
  t.context.userSessionId = session.id;
  const authSession = await t.context.authSessions.create({
    userSessionId: session.id,
    installationId: 'installation-1',
    platform: 'ios',
  });
  t.context.authSessionId = authSession.session.id;
});

test.after.always(async t => {
  await t.context.app.close();
});

const DEFAULT_ACCESS_TOKEN_TTL = 15 * 60;

function resetAuthSessionConfig(config: ConfigFactory) {
  config.override({
    auth: {
      session: {
        ttl: 60 * 60 * 24 * 15,
        ttr: 60 * 60 * 24 * 7,
      },
      token: {
        accessTokenTtl: DEFAULT_ACCESS_TOKEN_TTL,
      },
    },
  });
}

function assertSignedTtl(
  t: ExecutionContext,
  signed: { token: string; expiresAt: Date },
  expectedTtl: number
) {
  const ttlMs = signed.expiresAt.getTime() - Date.now();
  t.true(ttlMs > (expectedTtl - 5) * 1000);
  t.true(ttlMs <= (expectedTtl + 1) * 1000);

  const payload = jwt.decode(signed.token);
  t.truthy(payload);
  t.true(typeof payload !== 'string');
  if (!payload || typeof payload === 'string') return;
  t.is(typeof payload.iat, 'number');
  t.is(typeof payload.exp, 'number');
  if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') {
    return;
  }
  t.is(payload.exp - payload.iat, expectedTtl);
}

test.serial('should sign and verify a auth-session access jwt', async t => {
  const signed = await t.context.accessTokens.sign(
    t.context.user.id,
    t.context.authSessionId
  );
  const key = await t.context.keys.active();
  const nativePayload = jwt.verify(signed.token, key.secret, {
    algorithms: ['HS256'],
    audience: 'affine-client',
    issuer: 'affine',
  });

  const session = await t.context.accessTokens.verify(signed.token);

  t.true(typeof nativePayload !== 'string');
  t.is(session.user.id, t.context.user.id);
  t.is(session.sessionId, t.context.sessionId);
  t.is(session.authSessionId, t.context.authSessionId);
  t.true(signed.expiresAt.getTime() > Date.now());
});

test.serial('should use the auth-session access-token ttl', async t => {
  const defaultSigned = await t.context.accessTokens.sign(
    t.context.user.id,
    t.context.authSessionId
  );
  assertSignedTtl(t, defaultSigned, DEFAULT_ACCESS_TOKEN_TTL);

  const ttl = 120;
  t.context.config.override({
    auth: {
      token: {
        accessTokenTtl: ttl,
      },
    },
  });

  const configuredSigned = await t.context.accessTokens.sign(
    t.context.user.id,
    t.context.authSessionId
  );
  assertSignedTtl(t, configuredSigned, ttl);
});

test.serial('should reject invalid jwt cases', async t => {
  const key = await t.context.keys.active();
  const sign = (claims: object, overrides: jwt.SignOptions = {}) =>
    jwt.sign(claims, key.secret, {
      algorithm: 'HS256',
      audience: 'affine-client',
      expiresIn: 60,
      issuer: 'affine',
      keyid: key.id,
      subject: t.context.user.id,
      ...overrides,
    });
  const cases: Array<{ name: string; token: string; code: string }> = [
    {
      name: 'expired token',
      token: sign(
        { sid: t.context.authSessionId, typ: 'session_access' },
        { expiresIn: -31 }
      ),
      code: 'ACCESS_TOKEN_EXPIRED',
    },
    {
      name: 'wrong signature',
      token: jwt.sign(
        { sid: t.context.authSessionId, typ: 'session_access' },
        'wrong-key',
        {
          algorithm: 'HS256',
          audience: 'affine-client',
          expiresIn: 60,
          issuer: 'affine',
          keyid: key.id,
          subject: t.context.user.id,
        }
      ),
      code: 'ACCESS_TOKEN_INVALID',
    },
    {
      name: 'unknown key id',
      token: jwt.sign(
        { sid: t.context.authSessionId, typ: 'session_access' },
        key.secret,
        {
          algorithm: 'HS256',
          audience: 'affine-client',
          expiresIn: 60,
          issuer: 'affine',
          keyid: 'unknown',
          subject: t.context.user.id,
        }
      ),
      code: 'ACCESS_TOKEN_INVALID',
    },
    {
      name: 'wrong algorithm',
      token: jwt.sign(
        { sid: t.context.authSessionId, typ: 'session_access' },
        key.secret,
        {
          algorithm: 'HS384',
          audience: 'affine-client',
          expiresIn: 60,
          issuer: 'affine',
          keyid: key.id,
          subject: t.context.user.id,
        }
      ),
      code: 'ACCESS_TOKEN_INVALID',
    },
    {
      name: 'wrong issuer',
      token: sign(
        { sid: t.context.authSessionId, typ: 'session_access' },
        { issuer: 'other-issuer' }
      ),
      code: 'ACCESS_TOKEN_INVALID',
    },
    {
      name: 'wrong audience',
      token: sign(
        { sid: t.context.authSessionId, typ: 'session_access' },
        { audience: 'other-audience' }
      ),
      code: 'ACCESS_TOKEN_INVALID',
    },
    {
      name: 'wrong type',
      token: sign({
        sid: t.context.authSessionId,
        typ: 'user_session',
      }),
      code: 'ACCESS_TOKEN_INVALID',
    },
    {
      name: 'missing time claims',
      token: jwt.sign(
        { sid: t.context.authSessionId, typ: 'session_access' },
        key.secret,
        {
          algorithm: 'HS256',
          audience: 'affine-client',
          issuer: 'affine',
          keyid: key.id,
          subject: t.context.user.id,
          noTimestamp: true,
        }
      ),
      code: 'ACCESS_TOKEN_INVALID',
    },
    {
      name: 'wrong header type',
      token: jwt.sign(
        { sid: t.context.authSessionId, typ: 'session_access' },
        key.secret,
        {
          algorithm: 'HS256',
          audience: 'affine-client',
          expiresIn: 60,
          issuer: 'affine',
          header: { alg: 'HS256', kid: key.id, typ: 'NOT_JWT' },
          subject: t.context.user.id,
        }
      ),
      code: 'ACCESS_TOKEN_INVALID',
    },
    {
      name: 'future issued-at',
      token: jwt.sign(
        {
          sid: t.context.authSessionId,
          typ: 'session_access',
          iat: Math.floor(Date.now() / 1000) + 31,
        },
        key.secret,
        {
          algorithm: 'HS256',
          audience: 'affine-client',
          expiresIn: 60,
          issuer: 'affine',
          keyid: key.id,
          subject: t.context.user.id,
        }
      ),
      code: 'ACCESS_TOKEN_INVALID',
    },
  ];

  for (const testCase of cases) {
    const error = await t.throwsAsync(() =>
      t.context.accessTokens.verify(testCase.token)
    );
    t.is(error?.message, testCase.code, testCase.name);
  }
});

test.serial(
  'should reject jwt when its auth or user session is invalid',
  async t => {
    const signed = await t.context.accessTokens.sign(
      t.context.user.id,
      t.context.authSessionId
    );

    await t.context.authSessions.revoke(t.context.authSessionId, 'test');

    const revoked = await t.throwsAsync(() =>
      t.context.accessTokens.verify(signed.token)
    );
    t.is(revoked?.message, 'AUTH_SESSION_REVOKED');

    const refreshed = await t.context.auth.createUserSession(t.context.user.id);
    const authSession = await t.context.authSessions.create({
      userSessionId: refreshed.id,
      installationId: 'installation-2',
      platform: 'android',
    });
    const expired = await t.context.accessTokens.sign(
      t.context.user.id,
      authSession.session.id
    );
    await t.context.db.userSession.updateMany({
      where: {
        userId: t.context.user.id,
        sessionId: refreshed.sessionId,
      },
      data: {
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const expiredError = await t.throwsAsync(() =>
      t.context.accessTokens.verify(expired.token)
    );
    t.is(expiredError?.message, 'AUTH_SESSION_EXPIRED');
  }
);

for (const expiry of ['idleExpiresAt', 'absoluteExpiresAt'] as const) {
  test.serial(
    `should reject access jwt after auth-session ${expiry}`,
    async t => {
      const signed = await t.context.accessTokens.sign(
        t.context.user.id,
        t.context.authSessionId
      );
      await t.context.db.authSession.update({
        where: { id: t.context.authSessionId },
        data: { [expiry]: new Date(Date.now() - 1000) },
      });

      const error = await t.throwsAsync(() =>
        t.context.accessTokens.verify(signed.token)
      );
      t.is(error?.message, 'AUTH_SESSION_EXPIRED');
    }
  );
}
