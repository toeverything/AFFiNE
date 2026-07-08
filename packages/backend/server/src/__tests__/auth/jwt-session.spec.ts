import { PrismaClient } from '@prisma/client';
import ava, { ExecutionContext, TestFn } from 'ava';
import jwt from 'jsonwebtoken';

import { ConfigFactory } from '../../base';
import { CryptoHelper } from '../../base/helpers';
import {
  AuthModule,
  AuthService,
  type CurrentUser,
  JwtSessionService,
} from '../../core/auth';
import { Models } from '../../models';
import { createTestingApp, TestingApp } from '../utils';

const test = ava as TestFn<{
  app: TestingApp;
  auth: AuthService;
  jwtSession: JwtSessionService;
  crypto: CryptoHelper;
  config: ConfigFactory;
  models: Models;
  db: PrismaClient;
  user: CurrentUser;
  sessionId: string;
}>;

test.before(async t => {
  const app = await createTestingApp({
    imports: [AuthModule],
  });

  t.context.app = app;
  t.context.auth = app.get(AuthService);
  t.context.jwtSession = app.get(JwtSessionService);
  t.context.crypto = app.get(CryptoHelper);
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
});

test.after.always(async t => {
  await t.context.app.close();
});

const DEFAULT_SESSION_TTL = 60 * 60 * 24 * 15;
const DEFAULT_SESSION_TTR = 60 * 60 * 24 * 7;

function resetAuthSessionConfig(config: ConfigFactory) {
  config.override({
    auth: {
      session: {
        ttl: DEFAULT_SESSION_TTL,
        ttr: DEFAULT_SESSION_TTR,
      },
    },
  });
}

function currentJwtKey(crypto: CryptoHelper) {
  return Buffer.concat([
    Buffer.from('affine:user-session-jwt:v1:'),
    crypto.keyPair.sha256.privateKey,
  ]);
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

test.serial('should sign and verify a user session jwt', async t => {
  const signed = t.context.jwtSession.sign(
    t.context.user.id,
    t.context.sessionId
  );

  const session = await t.context.jwtSession.verify(signed.token);

  t.is(session.user.id, t.context.user.id);
  t.is(session.sessionId, t.context.sessionId);
  t.true(signed.expiresAt.getTime() > Date.now());
});

test.serial('should use application session ttl for jwt expiration', async t => {
  const defaultSigned = t.context.jwtSession.sign(
    t.context.user.id,
    t.context.sessionId
  );
  assertSignedTtl(t, defaultSigned, DEFAULT_SESSION_TTL);

  const ttl = 120;
  t.context.config.override({
    auth: {
      session: {
        ttl,
      },
    },
  });

  const configuredSigned = t.context.jwtSession.sign(
    t.context.user.id,
    t.context.sessionId
  );
  assertSignedTtl(t, configuredSigned, ttl);
});

test.serial('should reject invalid jwt cases', async t => {
  const cases: Array<{ name: string; token: string }> = [
    {
      name: 'expired token',
      token: jwt.sign(
        { sid: t.context.sessionId, typ: 'user_session' },
        currentJwtKey(t.context.crypto),
        {
          algorithm: 'HS256',
          audience: 'affine-client',
          expiresIn: -1,
          issuer: 'affine',
          subject: t.context.user.id,
        }
      ),
    },
    {
      name: 'wrong signature',
      token: jwt.sign(
        { sid: t.context.sessionId, typ: 'user_session' },
        'wrong-key',
        {
          algorithm: 'HS256',
          audience: 'affine-client',
          expiresIn: 60,
          issuer: 'affine',
          subject: t.context.user.id,
        }
      ),
    },
    {
      name: 'wrong issuer',
      token: jwt.sign(
        { sid: t.context.sessionId, typ: 'user_session' },
        currentJwtKey(t.context.crypto),
        {
          algorithm: 'HS256',
          audience: 'affine-client',
          expiresIn: 60,
          issuer: 'other-issuer',
          subject: t.context.user.id,
        }
      ),
    },
    {
      name: 'wrong audience',
      token: jwt.sign(
        { sid: t.context.sessionId, typ: 'user_session' },
        currentJwtKey(t.context.crypto),
        {
          algorithm: 'HS256',
          audience: 'other-audience',
          expiresIn: 60,
          issuer: 'affine',
          subject: t.context.user.id,
        }
      ),
    },
    {
      name: 'wrong type',
      token: jwt.sign(
        { sid: t.context.sessionId, typ: 'personal_access_token' },
        currentJwtKey(t.context.crypto),
        {
          algorithm: 'HS256',
          audience: 'affine-client',
          expiresIn: 60,
          issuer: 'affine',
          subject: t.context.user.id,
        }
      ),
    },
  ];

  for (const testCase of cases) {
    await t.throwsAsync(() => t.context.jwtSession.verify(testCase.token), {
      message: 'You must sign in first to access this resource.',
    });
  }
});

test.serial(
  'should reject jwt when its user session is missing or expired',
  async t => {
    const signed = t.context.jwtSession.sign(
      t.context.user.id,
      t.context.sessionId
    );

    await t.context.auth.signOut(t.context.sessionId, t.context.user.id);

    await t.throwsAsync(() => t.context.jwtSession.verify(signed.token), {
      message: 'You must sign in first to access this resource.',
    });

    const refreshed = await t.context.auth.createUserSession(t.context.user.id);
    const expired = t.context.jwtSession.sign(
      t.context.user.id,
      refreshed.sessionId
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

    await t.throwsAsync(() => t.context.jwtSession.verify(expired.token), {
      message: 'You must sign in first to access this resource.',
    });
  }
);
