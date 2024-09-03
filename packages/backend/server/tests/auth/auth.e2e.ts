import { randomBytes } from 'node:crypto';

import {
  getCurrentMailMessageCount,
  getTokenFromLatestMailMessage,
} from '@affine-test/kit/utils/cloud';
import type { INestApplication } from '@nestjs/common';
import type { TestFn } from 'ava';
import ava from 'ava';

import { AuthService } from '../../src/core/auth/service';
import { MailService } from '../../src/fundamentals/mailer';
import {
  changeEmail,
  changePassword,
  createTestingApp,
  currentUser,
  sendChangeEmail,
  sendSetPasswordEmail,
  sendVerifyChangeEmail,
  signUp,
} from '../utils';

const test = ava as TestFn<{
  app: INestApplication;
  auth: AuthService;
  mail: MailService;
}>;

test.beforeEach(async t => {
  const { app } = await createTestingApp();
  const auth = app.get(AuthService);
  const mail = app.get(MailService);
  t.context.app = app;
  t.context.auth = auth;
  t.context.mail = mail;
});

test.afterEach.always(async t => {
  await t.context.app.close();
});

test('change email', async t => {
  const { mail, app } = t.context;
  if (mail.hasConfigured()) {
    const u1Email = 'u1@affine.pro';
    const u2Email = 'u2@affine.pro';

    const u1 = await signUp(app, 'u1', u1Email, '1');

    const primitiveMailCount = await getCurrentMailMessageCount();

    await sendChangeEmail(app, u1.token.token, u1Email, 'affine.pro');

    const afterSendChangeMailCount = await getCurrentMailMessageCount();
    t.is(
      primitiveMailCount + 1,
      afterSendChangeMailCount,
      'failed to send change email'
    );

    const changeEmailToken = await getTokenFromLatestMailMessage();

    t.not(
      changeEmailToken,
      null,
      'fail to get change email token from email content'
    );

    await sendVerifyChangeEmail(
      app,
      u1.token.token,
      changeEmailToken as string,
      u2Email,
      'affine.pro'
    );

    const afterSendVerifyMailCount = await getCurrentMailMessageCount();

    t.is(
      afterSendChangeMailCount + 1,
      afterSendVerifyMailCount,
      'failed to send verify email'
    );

    const verifyEmailToken = await getTokenFromLatestMailMessage();

    t.not(
      verifyEmailToken,
      null,
      'fail to get verify change email token from email content'
    );

    await changeEmail(app, u1.token.token, verifyEmailToken as string, u2Email);

    const afterNotificationMailCount = await getCurrentMailMessageCount();

    t.is(
      afterSendVerifyMailCount + 1,
      afterNotificationMailCount,
      'failed to send notification email'
    );
  }
  t.pass();
});

test('set and change password', async t => {
  const { mail, app, auth } = t.context;
  if (mail.hasConfigured()) {
    const u1Email = 'u1@affine.pro';

    const u1 = await signUp(app, 'u1', u1Email, '1');

    const primitiveMailCount = await getCurrentMailMessageCount();

    await sendSetPasswordEmail(app, u1.token.token, u1Email, 'affine.pro');

    const afterSendSetMailCount = await getCurrentMailMessageCount();

    t.is(
      primitiveMailCount + 1,
      afterSendSetMailCount,
      'failed to send set email'
    );

    const setPasswordToken = await getTokenFromLatestMailMessage();

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

    const ret = auth.signIn(u1Email, newPassword);
    t.notThrowsAsync(ret, 'failed to check password');
    t.is((await ret).id, u1.id, 'failed to check password');
  }
  t.pass();
});
test('should revoke token after change user identify', async t => {
  const { mail, app, auth } = t.context;
  if (mail.hasConfigured()) {
    // change email
    {
      const u1Email = 'u1@affine.pro';
      const u2Email = 'u2@affine.pro';

      const u1 = await signUp(app, 'u1', u1Email, '1');

      {
        const user = await currentUser(app, u1.token.token);
        t.is(user?.email, u1Email, 'failed to get current user');
      }

      await sendChangeEmail(app, u1.token.token, u1Email, 'affine.pro');

      const changeEmailToken = await getTokenFromLatestMailMessage();
      await sendVerifyChangeEmail(
        app,
        u1.token.token,
        changeEmailToken as string,
        u2Email,
        'affine.pro'
      );

      const verifyEmailToken = await getTokenFromLatestMailMessage();
      await changeEmail(
        app,
        u1.token.token,
        verifyEmailToken as string,
        u2Email
      );

      const user = await currentUser(app, u1.token.token);
      t.is(user, null, 'token should be revoked');

      const newUserSession = await auth.signIn(u2Email, '1');
      t.is(newUserSession?.email, u2Email, 'failed to sign in with new email');
    }

    // change password
    {
      const u3Email = 'u3@affine.pro';

      const u3 = await signUp(app, 'u1', u3Email, '1');

      {
        const user = await currentUser(app, u3.token.token);
        t.is(user?.email, u3Email, 'failed to get current user');
      }

      await sendSetPasswordEmail(app, u3.token.token, u3Email, 'affine.pro');
      const token = await getTokenFromLatestMailMessage();
      const newPassword = randomBytes(16).toString('hex');
      await changePassword(app, u3.id, token as string, newPassword);

      const user = await currentUser(app, u3.token.token);
      t.is(user, null, 'token should be revoked');

      const newUserSession = await auth.signIn(u3Email, newPassword);
      t.is(
        newUserSession?.email,
        u3Email,
        'failed to sign in with new password'
      );
    }
  }
  t.pass();
});
