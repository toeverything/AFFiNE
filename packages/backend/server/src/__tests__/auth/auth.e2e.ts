import { randomBytes } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import type { TestFn } from 'ava';
import ava from 'ava';
import supertest from 'supertest';

import { AuthService, AuthSessionService } from '../../core/auth';
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
  const signedIn = await currentUser(app);
  const jwt = signedIn?.token.token;
  t.truthy(jwt);

  await sendChangeEmail(app, '/email-change');

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
    '/email-change-verify'
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

  const revokedCookieSession = await currentUser(app);
  t.is(revokedCookieSession, null);

  const revokedJwtSession = await supertest(app.getHttpServer())
    .get('/api/auth/session')
    .set('Authorization', `Bearer ${jwt}`)
    .expect(200);
  t.falsy(revokedJwtSession.body.user);

  app.clearAuth();
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
  const parent = await app.get(AuthService).createUserSession(u1.id);
  const authSession = await app.get(AuthSessionService).create({
    userSessionId: parent.id,
    installationId: 'password-change-device',
    platform: 'ios',
  });
  await sendSetPasswordEmail(app, u1Email, '/password-change');

  const setPasswordMail = app.mails.last('SetPassword');
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
  t.is(
    await app.get(PrismaClient).authSession.count({
      where: { id: authSession.session.id },
    }),
    0
  );

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

test('should forbid graphql callbackUrl to external origin', async t => {
  const { app } = t.context;

  const u1Email = 'u1@affine.pro';
  await app.signupV1(u1Email);

  const res = await app
    .POST('/graphql')
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
        mutation($callbackUrl: String!) {
          sendChangeEmail(callbackUrl: $callbackUrl)
        }
      `,
      variables: {
        callbackUrl: 'https://evil.example',
      },
    })
    .expect(200);

  t.truthy(res.body.errors?.length);
  t.is(res.body.errors[0].extensions?.name, 'ACTION_FORBIDDEN');
});
