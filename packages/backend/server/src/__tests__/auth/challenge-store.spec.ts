import ava, { TestFn } from 'ava';
import Sinon from 'sinon';

import { SessionCache } from '../../base';
import { AuthChallengeStore, AuthModule } from '../../core/auth';
import { createTestingApp, TestingApp } from '../utils';

const test = ava as TestFn<{
  app: TestingApp;
  challenges: AuthChallengeStore;
}>;

test.before(async t => {
  const app = await createTestingApp({
    imports: [AuthModule],
  });

  t.context.app = app;
  t.context.challenges = app.get(AuthChallengeStore);
});

test.beforeEach(() => {
  Sinon.restore();
});

test.after.always(async t => {
  await t.context.app.close();
});

test('should create and get challenge payload without consuming it', async t => {
  const token = await t.context.challenges.create(
    'oauth_state',
    { provider: 'Google' },
    30_000
  );

  t.deepEqual(await t.context.challenges.get('oauth_state', token), {
    provider: 'Google',
  });
  t.deepEqual(await t.context.challenges.get('oauth_state', token), {
    provider: 'Google',
  });
});

test('should consume challenge payload once', async t => {
  const token = await t.context.challenges.create(
    'open_app_sign_in',
    { userId: 'u1' },
    30_000
  );

  t.deepEqual(await t.context.challenges.consume('open_app_sign_in', token), {
    userId: 'u1',
  });
  t.is(await t.context.challenges.consume('open_app_sign_in', token), null);
});

test('should isolate challenges by purpose', async t => {
  const token = await t.context.challenges.create(
    'open_app_sign_in',
    { userId: 'u1' },
    30_000
  );

  t.is(await t.context.challenges.get('oauth_state', token), null);
  t.is(await t.context.challenges.consume('oauth_state', token), null);
  t.deepEqual(await t.context.challenges.consume('open_app_sign_in', token), {
    userId: 'u1',
  });
});

test('should return null for expired challenge', async t => {
  const token = await t.context.challenges.create(
    'open_app_sign_in',
    { userId: 'u1' },
    1
  );

  await new Promise(resolve => setTimeout(resolve, 10));

  t.is(await t.context.challenges.get('open_app_sign_in', token), null);
  t.is(await t.context.challenges.consume('open_app_sign_in', token), null);
});

test('should reject invalid challenge ttl', async t => {
  await t.throwsAsync(
    t.context.challenges.create('open_app_sign_in', { userId: 'u1' }, 0),
    { message: /Invalid auth state/ }
  );
});

test('should reject challenge creation when cache write fails', async t => {
  Sinon.stub(t.context.app.get(SessionCache), 'set').resolves(false);

  await t.throwsAsync(
    t.context.challenges.create('open_app_sign_in', { userId: 'u1' }, 30_000),
    { message: /Invalid auth state/ }
  );
});

test('should atomically allow one concurrent consume', async t => {
  const token = await t.context.challenges.create(
    'open_app_sign_in',
    { userId: 'u1' },
    30_000
  );

  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      t.context.challenges.consume('open_app_sign_in', token)
    )
  );

  t.is(results.filter(Boolean).length, 1);
  t.deepEqual(results.find(Boolean), { userId: 'u1' });
});
