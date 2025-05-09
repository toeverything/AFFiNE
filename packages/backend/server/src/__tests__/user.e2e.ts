import test from 'ava';

import {
  createTestingApp,
  currentUser,
  deleteAccount,
  TestingApp,
} from './utils';

let app: TestingApp;

test.before(async () => {
  app = await createTestingApp();
});

test.beforeEach(async () => {
  await app.initTestingDB();
});

test.after.always(async () => {
  await app.close();
});

// TODO(@forehalo): signup test case
test.skip('should register a user', () => {});

test('should get current user', async t => {
  const user = await app.signupV1('u1@affine.pro');
  const currUser = await currentUser(app);
  t.is(currUser.id, user.id, 'user.id is not valid');
  t.is(currUser.name, user.name, 'user.name is not valid');
  t.is(currUser.email, user.email, 'user.email is not valid');
  t.true(currUser.hasPassword, 'currUser.hasPassword is not valid');
});

test('should be able to delete user', async t => {
  await app.signupV1('u1@affine.pro');
  const deleted = await deleteAccount(app);
  t.true(deleted);
  const currUser = await currentUser(app);
  t.is(currUser, null);
});
