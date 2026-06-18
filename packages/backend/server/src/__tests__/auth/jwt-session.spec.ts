import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';
import jwt from 'jsonwebtoken';

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
  t.context.models = app.get(Models);
  t.context.db = app.get(PrismaClient);
});

test.beforeEach(async t => {
  await t.context.app.initTestingDB();

  t.context.user = await t.context.auth.signUp('u1@affine.pro', '1');
  const session = await t.context.auth.createUserSession(t.context.user.id);
  t.context.sessionId = session.sessionId;
});

test.after.always(async t => {
  await t.context.app.close();
});

function currentJwtKey(crypto: CryptoHelper) {
  return Buffer.concat([
    Buffer.from('affine:user-session-jwt:v1:'),
    crypto.keyPair.sha256.privateKey,
  ]);
}

test('should sign and verify a user session jwt', async t => {
  const signed = t.context.jwtSession.sign(
    t.context.user.id,
    t.context.sessionId
  );

  const session = await t.context.jwtSession.verify(signed.token);

  t.is(session.user.id, t.context.user.id);
  t.is(session.sessionId, t.context.sessionId);
  t.true(signed.expiresAt.getTime() > Date.now());
});

test('should reject invalid jwt cases', async t => {
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

test('should reject jwt when its user session is missing or expired', async t => {
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
});
