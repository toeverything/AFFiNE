import { randomUUID } from 'node:crypto';

import { HttpStatus } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';
import Sinon from 'sinon';

import { AppModule } from '../../app.module';
import { URLHelper } from '../../base';
import { ConfigModule } from '../../base/config';
import { CurrentUser } from '../../core/auth';
import { AuthService } from '../../core/auth/service';
import { Models } from '../../models';
import { OAuthProviderName } from '../../plugins/oauth/config';
import { GoogleOAuthProvider } from '../../plugins/oauth/providers/google';
import { OAuthService } from '../../plugins/oauth/service';
import { createTestingApp, currentUser, TestingApp } from '../utils';

const test = ava as TestFn<{
  auth: AuthService;
  oauth: OAuthService;
  models: Models;
  u1: CurrentUser;
  db: PrismaClient;
  app: TestingApp;
}>;

test.before(async t => {
  const app = await createTestingApp({
    imports: [
      ConfigModule.override({
        oauth: {
          providers: {
            google: {
              clientId: 'google-client-id',
              clientSecret: 'google-client-secret',
            },
          },
        },
        server: {
          hosts: ['localhost', 'test.affine.dev'],
          https: true,
        },
      }),
      AppModule,
    ],
  });

  t.context.auth = app.get(AuthService);
  t.context.oauth = app.get(OAuthService);
  t.context.models = app.get(Models);
  t.context.db = app.get(PrismaClient);
  t.context.app = app;
});

test.beforeEach(async t => {
  Sinon.restore();
  await t.context.app.initTestingDB();
  t.context.u1 = await t.context.auth.signUp('u1@affine.pro', '1');
});

test.after.always(async t => {
  await t.context.app.close();
});

test("should be able to redirect to oauth provider's login page", async t => {
  const { app } = t.context;

  const res = await app
    .POST('/api/oauth/preflight')
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
  // state should be a json string
  const state = JSON.parse(redirect.searchParams.get('state')!);
  t.is(state.provider, 'Google');
  t.regex(
    state.state,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  );
});

test('should be able to redirect to oauth provider with multiple hosts', async t => {
  const { app } = t.context;

  const res = await app
    .POST('/api/oauth/preflight')
    .set('host', 'test.affine.dev')
    .send({ provider: 'Google' })
    .expect(HttpStatus.OK);

  const { url } = res.body;

  const redirect = new URL(url);
  t.is(redirect.origin, 'https://accounts.google.com');

  t.is(redirect.pathname, '/o/oauth2/v2/auth');
  t.is(redirect.searchParams.get('client_id'), 'google-client-id');
  t.is(
    redirect.searchParams.get('redirect_uri'),
    'https://test.affine.dev/oauth/callback'
  );
  t.is(redirect.searchParams.get('response_type'), 'code');
  t.is(redirect.searchParams.get('prompt'), 'select_account');
  t.truthy(redirect.searchParams.get('state'));
  // state should be a json string
  const state = JSON.parse(redirect.searchParams.get('state')!);
  t.is(state.provider, 'Google');
  t.regex(
    state.state,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  );
});

test('should be able to redirect to oauth provider with client_nonce', async t => {
  const { app } = t.context;

  const res = await app
    .POST('/api/oauth/preflight')
    .send({ provider: 'Google', client: 'affine', client_nonce: '1234567890' })
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
  // state should be a json string
  const state = JSON.parse(redirect.searchParams.get('state')!);
  t.is(state.provider, 'Google');
  t.is(state.client, 'affine');
  t.falsy(state.clientNonce);
  t.truthy(state.state);
});

test('should throw if provider is invalid', async t => {
  const { app } = t.context;

  await app
    .POST('/api/oauth/preflight')
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

  await app
    .POST('/api/oauth/callback')
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

  await app
    .POST('/api/oauth/callback')
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

  await app
    .POST('/api/oauth/callback')
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

  await app
    .POST('/api/oauth/callback')
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

  await app
    .POST('/api/oauth/callback')
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

  await app
    .POST('/api/oauth/callback')
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

function mockOAuthProvider(
  app: TestingApp,
  email: string,
  clientNonce?: string
) {
  const provider = app.get(GoogleOAuthProvider);
  const oauth = app.get(OAuthService);

  Sinon.stub(oauth, 'isValidState').resolves(true);
  Sinon.stub(oauth, 'getOAuthState').resolves({
    provider: OAuthProviderName.Google,
    clientNonce,
  });

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

  await app
    .POST('/api/oauth/callback')
    .send({ code: '1', state: '1' })
    .expect(HttpStatus.OK);

  const sessionUser = await currentUser(app);

  t.truthy(sessionUser);
  t.is(sessionUser!.email, 'u2@affine.pro');

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

test('should be able to sign up with oauth and client_nonce', async t => {
  const { app, db } = t.context;

  const clientNonce = randomUUID();
  const userEmail = `${clientNonce}@affine.pro`;
  mockOAuthProvider(app, userEmail, clientNonce);

  await app
    .POST('/api/oauth/callback')
    .send({ code: '1', state: '1', client_nonce: clientNonce })
    .expect(HttpStatus.OK);

  const sessionUser = await currentUser(app);

  t.truthy(sessionUser);
  t.is(sessionUser!.email, userEmail);

  const user = await db.user.findFirst({
    select: {
      email: true,
      connectedAccounts: true,
    },
    where: {
      email: userEmail,
    },
  });

  t.truthy(user);
  t.is(user!.email, userEmail);
  t.is(user!.connectedAccounts[0].providerAccountId, '1');
});

test('should throw if client_nonce is invalid', async t => {
  const { app } = t.context;

  const clientNonce = randomUUID();
  const userEmail = `${clientNonce}@affine.pro`;
  mockOAuthProvider(app, userEmail, clientNonce);

  await app
    .POST('/api/oauth/callback')
    .send({ code: '1', state: '1', client_nonce: 'invalid' })
    .expect(HttpStatus.BAD_REQUEST)
    .expect({
      status: 400,
      code: 'Bad Request',
      type: 'BAD_REQUEST',
      name: 'INVALID_AUTH_STATE',
      message:
        'Invalid auth state. You might start the auth progress from another device.',
    });

  t.pass();
});

test('should not throw if account registered', async t => {
  const { app, u1 } = t.context;

  mockOAuthProvider(app, u1.email);

  const res = await app
    .POST('/api/oauth/callback')
    .send({ code: '1', state: '1' })
    .expect(HttpStatus.OK);

  t.is(res.body.id, u1.id);
});

test('should be able to fullfil user with oauth sign in', async t => {
  const { app, models } = t.context;

  const u3 = await app.createUser('u3@affine.pro');

  mockOAuthProvider(app, u3.email);

  await app.POST('/api/oauth/callback').send({ code: '1', state: '1' });

  const sessionUser = await currentUser(app);

  t.truthy(sessionUser);
  t.is(sessionUser!.email, u3.email);

  const account = await models.user.getConnectedAccount(
    OAuthProviderName.Google,
    '1'
  );

  t.truthy(account);
  t.is(account!.user.id, u3.id);
});
