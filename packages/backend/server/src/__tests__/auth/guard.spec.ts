import { Controller, Get, HttpStatus } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';
import Sinon from 'sinon';
import request from 'supertest';

import { CANARY_CLIENT_VERSION_MAX_AGE_DAYS, ConfigFactory } from '../../base';
import {
  AccessTokenService,
  AuthModule,
  AuthSessionService,
  CurrentUser,
  Public,
  Session,
} from '../../core/auth';
import { AuthService } from '../../core/auth/service';
import { Models } from '../../models';
import { createTestingApp, TestingApp } from '../utils';

@Controller('/')
class TestController {
  @Public()
  @Get('/public')
  home(@CurrentUser() user?: CurrentUser) {
    return { user };
  }

  @Get('/private')
  private(@CurrentUser() user: CurrentUser) {
    return { user };
  }

  @Get('/session')
  session(@Session() session: Session) {
    return session;
  }
}

function makeCanaryDateVersion(date: Date, build = '015') {
  return `${date.getUTCFullYear()}.${date.getUTCMonth() + 1}.${date.getUTCDate()}-canary.${build}`;
}

const test = ava as TestFn<{
  app: TestingApp;
  server: any;
  auth: AuthService;
  accessTokens: AccessTokenService;
  authSessions: AuthSessionService;
  models: Models;
  db: PrismaClient;
  config: ConfigFactory;
  u1: CurrentUser;
  sessionId: string;
  authSessionId: string;
}>;

test.before(async t => {
  const app = await createTestingApp({
    imports: [AuthModule],
    controllers: [TestController],
  });

  t.context.app = app;
  t.context.server = app.getHttpServer();
  t.context.auth = app.get(AuthService);
  t.context.accessTokens = app.get(AccessTokenService);
  t.context.authSessions = app.get(AuthSessionService);
  t.context.models = app.get(Models);
  t.context.db = app.get(PrismaClient);
  t.context.config = app.get(ConfigFactory);
});

test.beforeEach(async t => {
  Sinon.restore();
  await t.context.app.initTestingDB();
  t.context.config.override({
    client: {
      versionControl: {
        enabled: false,
        requiredVersion: '>=0.25.0',
      },
    },
  });

  t.context.u1 = await t.context.auth.signUp('u1@affine.pro', '1');
  const session = await t.context.models.session.createSession();
  t.context.sessionId = session.id;
  const userSession = await t.context.auth.createUserSession(
    t.context.u1.id,
    t.context.sessionId
  );
  t.context.authSessionId = (
    await t.context.authSessions.create({
      userSessionId: userSession.id,
      installationId: 'installation-1',
      platform: 'ios',
    })
  ).session.id;
});

test.after.always(async t => {
  await t.context.app.close();
});

test('should be able to visit public api if not signed in', async t => {
  const res = await request(t.context.server).get('/public').expect(200);

  t.is(res.body.user, undefined);
});

test('should be able to visit public api if signed in', async t => {
  const res = await request(t.context.server)
    .get('/public')
    .set('Cookie', `${AuthService.sessionCookieName}=${t.context.sessionId}`)
    .expect(HttpStatus.OK);

  t.is(res.body.user.id, t.context.u1.id);
});

test('should not be able to visit private api if not signed in', async t => {
  await request(t.context.server)
    .get('/private')
    .expect(HttpStatus.UNAUTHORIZED)
    .expect({
      status: 401,
      code: 'Unauthorized',
      type: 'AUTHENTICATION_REQUIRED',
      name: 'AUTHENTICATION_REQUIRED',
      message: 'You must sign in first to access this resource.',
    });

  t.assert(true);
});

test('should be able to visit private api with cookie session', async t => {
  const res = await request(t.context.server)
    .get('/private')
    .set('Cookie', `${AuthService.sessionCookieName}=${t.context.sessionId}`)
    .expect(HttpStatus.OK);

  t.is(res.body.user.id, t.context.u1.id);
});

test('should reject a legacy bearer session id', async t => {
  await request(t.context.server)
    .get('/private')
    .set('Authorization', `Bearer ${t.context.sessionId}`)
    .expect(HttpStatus.UNAUTHORIZED);
  t.pass();
});

test('should be able to visit private api with personal access token', async t => {
  const accessToken = await t.context.models.accessToken.create({
    userId: t.context.u1.id,
    name: 'test',
  });

  const res = await request(t.context.server)
    .get('/private')
    .set('Authorization', `Bearer ${accessToken.token}`)
    .expect(HttpStatus.OK);

  t.is(res.body.user.id, t.context.u1.id);
});

test('should be able to visit private api with auth-session access jwt', async t => {
  const jwt = await t.context.accessTokens.sign(
    t.context.u1.id,
    t.context.authSessionId
  );

  const res = await request(t.context.server)
    .get('/private')
    .set('Authorization', `Bearer ${jwt.token}`)
    .expect(HttpStatus.OK);

  t.is(res.body.user.id, t.context.u1.id);
});

test('should prefer bearer jwt over cookie session', async t => {
  const u2 = await t.context.auth.signUp('u2@affine.pro', '1');
  const u2Session = await t.context.auth.createUserSession(u2.id);
  const u2AuthSessionPrincipal = await t.context.authSessions.create({
    userSessionId: u2Session.id,
    installationId: 'installation-2',
    platform: 'android',
  });
  const jwt = await t.context.accessTokens.sign(
    u2.id,
    u2AuthSessionPrincipal.session.id
  );

  const res = await request(t.context.server)
    .get('/private')
    .set('Cookie', `${AuthService.sessionCookieName}=${t.context.sessionId}`)
    .set('Authorization', `Bearer ${jwt.token}`)
    .expect(HttpStatus.OK);

  t.is(res.body.user.id, u2.id);
});

test('should reject jwt after its user session is deleted', async t => {
  const jwt = await t.context.accessTokens.sign(
    t.context.u1.id,
    t.context.authSessionId
  );

  await t.context.auth.signOut(t.context.sessionId, t.context.u1.id);

  await request(t.context.server)
    .get('/private')
    .set('Authorization', `Bearer ${jwt.token}`)
    .expect(HttpStatus.UNAUTHORIZED);

  t.pass();
});

test('should enforce client version for auth-session access jwt auth', async t => {
  t.context.config.override({
    client: {
      versionControl: {
        enabled: true,
        requiredVersion: '>=0.25.0',
      },
    },
  });

  const session = await t.context.auth.createUserSession(t.context.u1.id);
  const authSession = await t.context.authSessions.create({
    userSessionId: session.id,
    installationId: 'version-installation',
    platform: 'electron',
  });
  const token = (
    await t.context.accessTokens.sign(t.context.u1.id, authSession.session.id)
  ).token;
  const res = await request(t.context.server)
    .get('/private')
    .set('Authorization', `Bearer ${token}`)
    .set('x-affine-version', '0.24.0')
    .expect(HttpStatus.FORBIDDEN);

  t.is(
    res.body.message,
    'Unsupported client with version [0.24.0], required version is [>=0.25.0].'
  );
});

test('should not hide an invalid auth-session jwt behind a cookie session', async t => {
  const res = await request(t.context.server)
    .get('/public')
    .set('Cookie', `${AuthService.sessionCookieName}=${t.context.sessionId}`)
    .set('Authorization', 'Bearer invalid.jwt.token')
    .expect(HttpStatus.UNAUTHORIZED);

  t.is(res.body.code, 'ACCESS_TOKEN_INVALID');
});

test('should return a stable error for invalid jwt on public api', async t => {
  const res = await request(t.context.server)
    .get('/public')
    .set('Authorization', 'Bearer invalid.jwt.token')
    .expect(HttpStatus.UNAUTHORIZED);

  t.is(res.body.code, 'ACCESS_TOKEN_INVALID');
});

test('should be able to parse session cookie', async t => {
  const spy = Sinon.spy(t.context.auth, 'getUserSession');
  await request(t.context.server)
    .get('/public')
    .set('cookie', `${AuthService.sessionCookieName}=${t.context.sessionId}`)
    .expect(200);

  t.deepEqual(spy.firstCall.args, [t.context.sessionId, undefined]);
  spy.restore();
});

test('should not parse a legacy bearer session id', async t => {
  const spy = Sinon.spy(t.context.auth, 'getUserSession');

  await request(t.context.server)
    .get('/public')
    .auth(t.context.sessionId, { type: 'bearer' })
    .expect(200);

  t.false(spy.called);
  spy.restore();
});

test('should expose auth-session version rejection on a public api', async t => {
  t.context.config.override({
    client: {
      versionControl: {
        enabled: true,
        requiredVersion: '>=0.25.0',
      },
    },
  });
  const token = (
    await t.context.accessTokens.sign(t.context.u1.id, t.context.authSessionId)
  ).token;
  const res = await request(t.context.server)
    .get('/public')
    .set('Authorization', `Bearer ${token}`)
    .set('x-affine-version', '0.24.0')
    .expect(HttpStatus.FORBIDDEN);

  t.is(res.body.name, 'UNSUPPORTED_CLIENT_VERSION');
});

test('should be able to refresh session if needed', async t => {
  await t.context.app.get(PrismaClient).userSession.updateMany({
    where: {
      sessionId: t.context.sessionId,
    },
    data: {
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 /* expires in 1 hour */),
    },
  });

  const res = await request(t.context.server)
    .get('/session')
    .set('cookie', `${AuthService.sessionCookieName}=${t.context.sessionId}`)
    .expect(200);

  const cookie = res
    .get('Set-Cookie')
    ?.find(c => c.startsWith(AuthService.sessionCookieName));

  t.truthy(cookie);
});

test('should record refresh client version when refreshed', async t => {
  await t.context.db.userSession.updateMany({
    where: { sessionId: t.context.sessionId },
    data: {
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 /* expires in 1 hour */),
    },
  });

  await request(t.context.server)
    .get('/session')
    .set('cookie', `${AuthService.sessionCookieName}=${t.context.sessionId}`)
    .set('x-affine-version', '0.25.2')
    .expect(200);

  const userSession = await t.context.db.userSession.findFirst({
    where: { sessionId: t.context.sessionId, userId: t.context.u1.id },
  });
  t.is(userSession?.refreshClientVersion, '0.25.2');
});

test('should allow auth when header is missing but stored version is valid', async t => {
  t.context.config.override({
    client: {
      versionControl: {
        enabled: true,
        requiredVersion: '>=0.25.0',
      },
    },
  });

  await t.context.db.userSession.updateMany({
    where: { sessionId: t.context.sessionId },
    data: { signInClientVersion: '0.25.0' },
  });

  const res = await request(t.context.server)
    .get('/private')
    .set('Cookie', `${AuthService.sessionCookieName}=${t.context.sessionId}`)
    .expect(200);

  t.is(res.body.user.id, t.context.u1.id);
});

test('should kick out unsupported client version on non-public handler', async t => {
  t.context.config.override({
    client: {
      versionControl: {
        enabled: true,
        requiredVersion: '>=0.25.0',
      },
    },
  });

  const res = await request(t.context.server)
    .get('/private')
    .set('Cookie', `${AuthService.sessionCookieName}=${t.context.sessionId}`)
    .set('x-affine-version', '0.24.0')
    .expect(403);

  const setCookies = res.get('Set-Cookie') ?? [];
  t.true(
    setCookies.some(c => c.startsWith(`${AuthService.sessionCookieName}=`))
  );
  t.true(setCookies.some(c => c.startsWith(`${AuthService.userCookieName}=`)));
  t.true(setCookies.some(c => c.startsWith(`${AuthService.csrfCookieName}=`)));

  const session = await t.context.db.session.findFirst({
    where: { id: t.context.sessionId },
  });
  t.is(session, null);
});

test('should not block public handler when client version is unsupported', async t => {
  t.context.config.override({
    client: {
      versionControl: {
        enabled: true,
        requiredVersion: '>=0.25.0',
      },
    },
  });

  const res = await request(t.context.server)
    .get('/public')
    .set('Cookie', `${AuthService.sessionCookieName}=${t.context.sessionId}`)
    .set('x-affine-version', '0.24.0')
    .expect(200);

  t.is(res.body.user, undefined);

  const setCookies = res.get('Set-Cookie') ?? [];
  t.true(
    setCookies.some(c => c.startsWith(`${AuthService.sessionCookieName}=`))
  );
  t.true(setCookies.some(c => c.startsWith(`${AuthService.userCookieName}=`)));
  t.true(setCookies.some(c => c.startsWith(`${AuthService.csrfCookieName}=`)));
});

test('should allow recent canary date version in canary namespace', async t => {
  t.context.config.override({
    client: {
      versionControl: {
        enabled: true,
        requiredVersion: '>=0.25.0',
      },
    },
  });

  const prevNamespace = env.NAMESPACE;
  // @ts-expect-error test
  env.NAMESPACE = 'dev';

  try {
    const res = await request(t.context.server)
      .get('/private')
      .set('Cookie', `${AuthService.sessionCookieName}=${t.context.sessionId}`)
      .set('x-affine-version', makeCanaryDateVersion(new Date(), '015'))
      .expect(200);

    t.is(res.body.user.id, t.context.u1.id);
  } finally {
    // @ts-expect-error test
    env.NAMESPACE = prevNamespace;
  }
});

test('should kick out old canary date version in canary namespace', async t => {
  t.context.config.override({
    client: {
      versionControl: {
        enabled: true,
        requiredVersion: '>=0.25.0',
      },
    },
  });

  const prevNamespace = env.NAMESPACE;
  // @ts-expect-error test
  env.NAMESPACE = 'dev';

  try {
    const old = new Date(
      Date.now() -
        (CANARY_CLIENT_VERSION_MAX_AGE_DAYS + 1) * 24 * 60 * 60 * 1000
    );
    const oldVersion = makeCanaryDateVersion(old, '015');

    const res = await request(t.context.server)
      .get('/private')
      .set('Cookie', `${AuthService.sessionCookieName}=${t.context.sessionId}`)
      .set('x-affine-version', oldVersion)
      .expect(403);

    t.is(
      res.body.message,
      `Unsupported client with version [${oldVersion}], required version is [canary (within 2 months)].`
    );
  } finally {
    // @ts-expect-error test
    env.NAMESPACE = prevNamespace;
  }
});
