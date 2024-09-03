import '../../src/plugins/config';

import { HttpStatus, INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';
import Sinon from 'sinon';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { CurrentUser } from '../../src/core/auth';
import { AuthService } from '../../src/core/auth/service';
import { UserService } from '../../src/core/user';
import { URLHelper } from '../../src/fundamentals';
import { ConfigModule } from '../../src/fundamentals/config';
import { OAuthProviderName } from '../../src/plugins/oauth/config';
import { GoogleOAuthProvider } from '../../src/plugins/oauth/providers/google';
import { OAuthService } from '../../src/plugins/oauth/service';
import { createTestingApp, getSession, initTestingDB } from '../utils';

const test = ava as TestFn<{
  auth: AuthService;
  oauth: OAuthService;
  user: UserService;
  u1: CurrentUser;
  db: PrismaClient;
  app: INestApplication;
}>;

test.before(async t => {
  const { app } = await createTestingApp({
    imports: [
      ConfigModule.forRoot({
        plugins: {
          oauth: {
            providers: {
              google: {
                clientId: 'google-client-id',
                clientSecret: 'google-client-secret',
              },
            },
          },
        },
      }),
      AppModule,
    ],
  });

  t.context.auth = app.get(AuthService);
  t.context.oauth = app.get(OAuthService);
  t.context.user = app.get(UserService);
  t.context.db = app.get(PrismaClient);
  t.context.app = app;
});

test.beforeEach(async t => {
  Sinon.restore();
  await initTestingDB(t.context.db);
  t.context.u1 = await t.context.auth.signUp('u1@affine.pro', '1');
});

test.after.always(async t => {
  await t.context.app.close();
});

test("should be able to redirect to oauth provider's login page", async t => {
  const { app } = t.context;

  const res = await request(app.getHttpServer())
    .post('/api/oauth/preflight')
    .send({ provider: 'Google' })
    .expect(HttpStatus.OK);

  const { url } = res.body;

  const redirect = new URL(url);
  t.is(redirect.origin, 'https://accounts.google.com');

  t.is(redirect.pathname, '/o/oauth2/v2/auth');
  t.is(redirect.searchParams.get('client_id'), 'google-client-id');
  t.is(
    redirect.searchParams.get('redirect_uri'),
    app.get(URLHelper).link('/oauth/callback')
  );
  t.is(redirect.searchParams.get('response_type'), 'code');
  t.is(redirect.searchParams.get('prompt'), 'select_account');
  t.truthy(redirect.searchParams.get('state'));
});

test('should throw if provider is invalid', async t => {
  const { app } = t.context;

  await request(app.getHttpServer())
    .post('/api/oauth/preflight')
    .send({ provider: 'Invalid' })
    .expect(HttpStatus.BAD_REQUEST)
    .expect({
      status: 400,
      code: 'Bad Request',
      type: 'INVALID_INPUT',
      name: 'UNKNOWN_OAUTH_PROVIDER',
      message: 'Unknown authentication provider Invalid.',
      data: { name: 'Invalid' },
    });

  t.pass();
});

test('should be able to save oauth state', async t => {
  const { oauth } = t.context;

  const id = await oauth.saveOAuthState({
    provider: OAuthProviderName.Google,
  });

  const state = await oauth.getOAuthState(id);

  t.truthy(state);
  t.is(state!.provider, OAuthProviderName.Google);
});

test('should be able to get registered oauth providers', async t => {
  const { oauth } = t.context;

  const providers = oauth.availableOAuthProviders();

  t.deepEqual(providers, [OAuthProviderName.Google]);
});

test('should throw if code is missing in callback uri', async t => {
  const { app } = t.context;

  await request(app.getHttpServer())
    .post('/api/oauth/callback')
    .send({})
    .expect(HttpStatus.BAD_REQUEST)
    .expect({
      status: 400,
      code: 'Bad Request',
      type: 'BAD_REQUEST',
      name: 'MISSING_OAUTH_QUERY_PARAMETER',
      message: 'Missing query parameter `code`.',
      data: { name: 'code' },
    });

  t.pass();
});

test('should throw if state is missing in callback uri', async t => {
  const { app } = t.context;

  await request(app.getHttpServer())
    .post('/api/oauth/callback')
    .send({ code: '1' })
    .expect(HttpStatus.BAD_REQUEST)
    .expect({
      status: 400,
      code: 'Bad Request',
      type: 'BAD_REQUEST',
      name: 'MISSING_OAUTH_QUERY_PARAMETER',
      message: 'Missing query parameter `state`.',
      data: { name: 'state' },
    });

  t.pass();
});

test('should throw if state is expired', async t => {
  const { app, oauth } = t.context;
  Sinon.stub(oauth, 'isValidState').resolves(true);

  await request(app.getHttpServer())
    .post('/api/oauth/callback')
    .send({ code: '1', state: '1' })
    .expect(HttpStatus.BAD_REQUEST)
    .expect({
      status: 400,
      code: 'Bad Request',
      type: 'BAD_REQUEST',
      name: 'OAUTH_STATE_EXPIRED',
      message: 'OAuth state expired, please try again.',
    });

  t.pass();
});

test('should throw if state is invalid', async t => {
  const { app } = t.context;

  await request(app.getHttpServer())
    .post('/api/oauth/callback')
    .send({ code: '1', state: '1' })
    .expect(HttpStatus.BAD_REQUEST)
    .expect({
      status: 400,
      code: 'Bad Request',
      type: 'BAD_REQUEST',
      name: 'INVALID_OAUTH_CALLBACK_STATE',
      message: 'Invalid callback state parameter.',
    });

  t.pass();
});

test('should throw if provider is missing in state', async t => {
  const { app, oauth } = t.context;

  // @ts-expect-error mock
  Sinon.stub(oauth, 'getOAuthState').resolves({});
  Sinon.stub(oauth, 'isValidState').resolves(true);

  await request(app.getHttpServer())
    .post('/api/oauth/callback')
    .send({ code: '1', state: '1' })
    .expect(HttpStatus.BAD_REQUEST)
    .expect({
      status: 400,
      code: 'Bad Request',
      type: 'BAD_REQUEST',
      name: 'MISSING_OAUTH_QUERY_PARAMETER',
      message: 'Missing query parameter `provider`.',
      data: { name: 'provider' },
    });

  t.pass();
});

test('should throw if provider is invalid in callback uri', async t => {
  const { app, oauth } = t.context;

  // @ts-expect-error mock
  Sinon.stub(oauth, 'getOAuthState').resolves({ provider: 'Invalid' });
  Sinon.stub(oauth, 'isValidState').resolves(true);

  await request(app.getHttpServer())
    .post('/api/oauth/callback')
    .send({ code: '1', state: '1' })
    .expect(HttpStatus.BAD_REQUEST)
    .expect({
      status: 400,
      code: 'Bad Request',
      type: 'INVALID_INPUT',
      name: 'UNKNOWN_OAUTH_PROVIDER',
      message: 'Unknown authentication provider Invalid.',
      data: { name: 'Invalid' },
    });

  t.pass();
});

function mockOAuthProvider(app: INestApplication, email: string) {
  const provider = app.get(GoogleOAuthProvider);
  const oauth = app.get(OAuthService);

  Sinon.stub(oauth, 'isValidState').resolves(true);
  Sinon.stub(oauth, 'getOAuthState').resolves({
    provider: OAuthProviderName.Google,
  });

  // @ts-expect-error mock
  Sinon.stub(provider, 'getToken').resolves({ accessToken: '1' });
  Sinon.stub(provider, 'getUser').resolves({
    id: '1',
    email,
    avatarUrl: 'avatar',
  });
}

test('should be able to sign up with oauth', async t => {
  const { app, db } = t.context;

  mockOAuthProvider(app, 'u2@affine.pro');

  const res = await request(app.getHttpServer())
    .post(`/api/oauth/callback`)
    .send({ code: '1', state: '1' })
    .expect(HttpStatus.OK);

  const session = await getSession(app, res);

  t.truthy(session.user);
  t.is(session.user!.email, 'u2@affine.pro');

  const user = await db.user.findFirst({
    select: {
      email: true,
      connectedAccounts: true,
    },
    where: {
      email: 'u2@affine.pro',
    },
  });

  t.truthy(user);
  t.is(user!.email, 'u2@affine.pro');
  t.is(user!.connectedAccounts[0].providerAccountId, '1');
});

test('should not throw if account registered', async t => {
  const { app, u1 } = t.context;

  mockOAuthProvider(app, u1.email);

  const res = await request(app.getHttpServer())
    .post(`/api/oauth/callback`)
    .send({ code: '1', state: '1' })
    .expect(HttpStatus.OK);

  t.is(res.body.id, u1.id);
});

test('should be able to fullfil user with oauth sign in', async t => {
  const { app, user, db } = t.context;

  const u3 = await user.createUser({
    name: 'u3',
    email: 'u3@affine.pro',
    registered: false,
  });

  mockOAuthProvider(app, u3.email);

  const res = await request(app.getHttpServer())
    .post('/api/oauth/callback')
    .send({ code: '1', state: '1' })
    .expect(HttpStatus.OK);

  const session = await getSession(app, res);

  t.truthy(session.user);
  t.is(session.user!.email, u3.email);

  const account = await db.connectedAccount.findFirst({
    where: {
      userId: u3.id,
    },
  });

  t.truthy(account);
});
