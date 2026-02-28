import { randomBytes } from 'node:crypto';

import type { TestFn } from 'ava';
import ava from 'ava';

import {
  changeEmail,
  changePassword,
  createTestingApp,
  currentUser,
  sendChangeEmail,
  sendSetPasswordEmail,
  sendVerifyChangeEmail,
  TestingApp,
} from '../utils';

const test = ava as TestFn<{
  app: TestingApp;
}>;

test.beforeEach(async t => {
  const app = await createTestingApp();
  t.context.app = app;
});

test.afterEach.always(async t => {
  await t.context.app.close();
});

test('change email', async t => {
  const { app } = t.context;
  const u1Email = 'u1@affine.pro';
  const u2Email = 'u2@affine.pro';

  const user = await app.signupV1(u1Email);
  await sendChangeEmail(app, u1Email, 'affine.pro');

  const changeMail = app.mails.last('ChangeEmail');

  t.is(changeMail.to, u1Email);

  let link = new URL(changeMail.props.url);

  const changeEmailToken = link.searchParams.get('token');

  t.not(
    changeEmailToken,
    null,
    'fail to get change email token from email content'
  );

  await sendVerifyChangeEmail(
    app,
    changeEmailToken as string,
    u2Email,
    'affine.pro'
  );

  const verifyMail = app.mails.last('VerifyChangeEmail');

  t.is(verifyMail.to, u2Email);

  link = new URL(verifyMail.props.url);

  const verifyEmailToken = link.searchParams.get('token');

  t.not(
    verifyEmailToken,
    null,
    'fail to get verify change email token from email content'
  );

  await changeEmail(app, verifyEmailToken as string, u2Email);

  const changedMail = app.mails.last('EmailChanged');

  t.is(changedMail.to, u2Email);
  t.is(changedMail.props.to, u2Email);

  await app.logout();
  await app.login({
    ...user,
    email: u2Email,
  });

  const me = await currentUser(app);

  t.not(me, null, 'failed to get current user');
  t.is(me?.email, u2Email, 'failed to get current user');
});

test('set and change password', async t => {
  const { app } = t.context;
  const u1Email = 'u1@affine.pro';

  const u1 = await app.signupV1(u1Email);
  await sendSetPasswordEmail(app, u1Email, 'affine.pro');

  const setPasswordMail = app.mails.last('ChangePassword');
  const link = new URL(setPasswordMail.props.url);
  const setPasswordToken = link.searchParams.get('token');

  t.is(setPasswordMail.to, u1Email);
  t.not(
    setPasswordToken,
    null,
    'fail to get set password token from email content'
  );

  const newPassword = randomBytes(16).toString('hex');
  const success = await changePassword(
    app,
    u1.id,
    setPasswordToken as string,
    newPassword
  );

  t.true(success, 'failed to change password');

  let user = await currentUser(app);

  t.is(user, null);

  await app.login({
    ...u1,
    password: newPassword,
  });

  user = await currentUser(app);

  t.not(user, null, 'failed to get current user');
  t.is(user?.email, u1Email, 'failed to get current user');
});
