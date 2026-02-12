import ava, { TestFn } from 'ava';

import { createTestingApp, type TestingApp } from '../../../__tests__/utils';
import { buildAppModule } from '../../../app.module';
import { Models } from '../../../models';

const test = ava as TestFn<{
  app: TestingApp;
  models: Models;
  allowlistedAdminToken: string;
  nonAllowlistedAdminToken: string;
  userToken: string;
}>;

test.before(async t => {
  const app = await createTestingApp({
    imports: [buildAppModule(globalThis.env)],
  });

  t.context.app = app;
  t.context.models = app.get(Models);
});

test.beforeEach(async t => {
  await t.context.app.initTestingDB();

  const allowlistedAdmin = await t.context.models.user.create({
    email: 'admin@affine.pro',
    password: '1',
    emailVerifiedAt: new Date(),
  });
  await t.context.models.userFeature.add(
    allowlistedAdmin.id,
    'administrator',
    'test'
  );
  const allowlistedAdminToken = await t.context.models.accessToken.create({
    userId: allowlistedAdmin.id,
    name: 'test',
  });
  t.context.allowlistedAdminToken = allowlistedAdminToken.token;

  const nonAllowlistedAdmin = await t.context.models.user.create({
    email: 'admin2@affine.pro',
    password: '1',
    emailVerifiedAt: new Date(),
  });
  await t.context.models.userFeature.add(
    nonAllowlistedAdmin.id,
    'administrator',
    'test'
  );
  const nonAllowlistedAdminToken = await t.context.models.accessToken.create({
    userId: nonAllowlistedAdmin.id,
    name: 'test',
  });
  t.context.nonAllowlistedAdminToken = nonAllowlistedAdminToken.token;

  const user = await t.context.models.user.create({
    email: 'user@affine.pro',
    password: '1',
    emailVerifiedAt: new Date(),
  });
  const userToken = await t.context.models.accessToken.create({
    userId: user.id,
    name: 'test',
  });
  t.context.userToken = userToken.token;
});

test.after.always(async t => {
  await t.context.app.close();
});

test('should return 404 for non-admin user', async t => {
  await t.context.app
    .GET('/api/queue')
    .set('Authorization', `Bearer ${t.context.userToken}`)
    .expect(404);
  t.pass();
});

test('should allow allowlisted admin', async t => {
  await t.context.app
    .GET('/api/queue')
    .set('Authorization', `Bearer ${t.context.allowlistedAdminToken}`)
    .expect(200)
    .expect('Content-Type', /text\/html/);
  t.pass();
});
