import { HttpStatus } from '@nestjs/common';
import ava, { TestFn } from 'ava';

import { AppModule } from '../../app.module';
import { ConfigModule } from '../../base/config';
import { ServerFeature } from '../../core/config/types';
import { OAuthService } from '../../plugins/oauth/service';
import { createTestingApp, TestingApp } from '../utils';

const test = ava.serial as TestFn<{ app: TestingApp }>;

test.before(async t => {
  t.context.app = await createTestingApp({
    imports: [
      ConfigModule.override({
        oauth: {
          providers: {
            google: {
              clientId: 'google-client-id',
              clientSecret: 'google-client-secret',
            },
            github: {
              clientId: 'github-client-id',
              clientSecret: 'github-client-secret',
            },
            oidc: {
              clientId: '',
              clientSecret: '',
              issuer: '',
              args: {},
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
});

test.beforeEach(async t => {
  await t.context.app.initTestingDB();
});

test.after.always(async t => {
  await t.context.app.close();
});

test('oauth preflight preserves the public provider protocol', async t => {
  const { app } = t.context;
  for (const [provider, origin, path] of [
    ['Google', 'https://accounts.google.com', '/o/oauth2/v2/auth'],
    ['GitHub', 'https://github.com', '/login/oauth/authorize'],
  ] as const) {
    const response = await app
      .POST('/api/oauth/preflight')
      .set('host', 'test.affine.dev')
      .send({ provider, client: 'web', client_nonce: 'test-nonce' });
    t.is(response.status, HttpStatus.OK, JSON.stringify(response.body));
    const redirect = new URL(response.body.url as string);
    t.is(redirect.origin, origin);
    t.is(redirect.pathname, path);
    t.is(
      redirect.searchParams.get('client_id'),
      `${provider.toLowerCase()}-client-id`
    );
    t.is(
      redirect.searchParams.get('redirect_uri'),
      'https://test.affine.dev/oauth/callback'
    );
    const state = JSON.parse(redirect.searchParams.get('state')!);
    t.is(state.provider, provider);
    t.is(state.client, 'web');
    t.false('clientNonce' in state);
    t.regex(state.state, /^[0-9a-f-]{36}$/);
  }
});

test('oauth endpoints retain validation and callback error shapes', async t => {
  const { app } = t.context;
  for (const redirectUri of [
    'https://evil.example',
    '/\\\\evil.example/path',
    'javascript:alert(1)',
  ]) {
    await app
      .POST('/api/oauth/preflight')
      .send({
        provider: 'Google',
        client: 'web',
        redirect_uri: redirectUri,
        client_nonce: 'test-nonce',
      })
      .expect(HttpStatus.FORBIDDEN);
  }
  await app
    .POST('/api/oauth/preflight')
    .send({ provider: 'Google', client: 'web' })
    .expect(HttpStatus.BAD_REQUEST);
  await app
    .POST('/api/oauth/preflight')
    .send({ provider: 'Invalid', client: 'web', client_nonce: 'test-nonce' })
    .expect(HttpStatus.BAD_REQUEST);
  await app
    .POST('/api/oauth/callback')
    .send({ state: 'missing-code' })
    .expect(HttpStatus.BAD_REQUEST);
  await app
    .POST('/api/oauth/callback')
    .send({ code: 'missing-state' })
    .expect(HttpStatus.BAD_REQUEST);
  t.pass();
});

test('configured oauth providers remain visible through the reader', async t => {
  const { app } = t.context;
  t.deepEqual(app.get(OAuthService).providers.sort(), ['github', 'google']);
  t.truthy(ServerFeature.OAuth);
});
