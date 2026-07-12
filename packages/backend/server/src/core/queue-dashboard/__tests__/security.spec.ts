import ava, { TestFn } from 'ava';

import { createTestingApp, type TestingApp } from '../../../__tests__/utils';
import { buildAppModule } from '../../../app.module';
import { Models } from '../../../models';

const test = ava as TestFn<{
  app: TestingApp;
  models: Models;
  allowlistedAdminEmail: string;
  userEmail: string;
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
  t.context.allowlistedAdminEmail = allowlistedAdmin.email;

  const user = await t.context.models.user.create({
    email: 'user@affine.pro',
    password: '1',
    emailVerifiedAt: new Date(),
  });
  t.context.userEmail = user.email;
});

test.after.always(async t => {
  await t.context.app.close();
});

test('should return 404 for non-admin user', async t => {
  await t.context.app
    .POST('/api/auth/sign-in')
    .send({ email: t.context.userEmail, password: '1' })
    .expect(200);
  await t.context.app.GET('/api/queue').expect(404);
  t.pass();
});

test('should allow allowlisted admin', async t => {
  await t.context.app
    .POST('/api/auth/sign-in')
    .send({ email: t.context.allowlistedAdminEmail, password: '1' })
    .expect(200);
  await t.context.app
    .GET('/api/queue')
    .expect(200)
    .expect('Content-Type', /text\/html/);
  t.pass();
});
