import ava, { TestFn } from 'ava';

import { AuthMethodsService, AuthModule } from '../../core/auth';
import { Models } from '../../models';
import { createTestingApp, TestingApp } from '../utils';

const test = ava as TestFn<{
  app: TestingApp;
  authMethods: AuthMethodsService;
  models: Models;
}>;

test.before(async t => {
  const app = await createTestingApp({
    imports: [AuthModule],
  });

  t.context.app = app;
  t.context.authMethods = app.get(AuthMethodsService);
  t.context.models = app.get(Models);
});

test.beforeEach(async t => {
  await t.context.app.initTestingDB();
});

test.after.always(async t => {
  await t.context.app.close();
});

test('should return login preflight methods without top-level has fields', async t => {
  const user = await t.context.app.createUser('methods@affine.pro');

  const preflight = await t.context.authMethods.loginPreflight(user.email);

  t.true(preflight.registered);
  t.deepEqual(preflight.methods.password, { available: true });
  t.deepEqual(preflight.methods.magicLink, { available: true });
  t.deepEqual(preflight.methods.passkey, {
    available: false,
    discoverable: false,
  });
  t.false('hasPassword' in preflight);
});

test('should return bound account methods for settings', async t => {
  const user = await t.context.app.createUser('bound-methods@affine.pro');

  await t.context.models.user.createConnectedAccount({
    userId: user.id,
    provider: 'Google',
    providerAccountId: 'google-account',
    accessToken: 'access-token',
  });

  const methods = await t.context.authMethods.boundMethods(user.id);

  t.deepEqual(methods.password, { bound: true });
  t.deepEqual(methods.oauth, {
    bound: true,
    providers: ['Google'],
  });
  t.deepEqual(methods.passkey, { bound: false, count: 0 });
});
