import {
  getCurrentMailMessageCount,
  getLatestMailMessage,
} from '@affine-test/kit/utils/cloud';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import ava, { type TestFn } from 'ava';
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';

import { AppModule } from '../src/app';
import { MailService } from '../src/modules/auth/mailer';
import { AuthService } from '../src/modules/auth/service';
import {
  changeEmail,
  createWorkspace,
  sendChangeEmail,
  sendVerifyChangeEmail,
  signUp,
} from './utils';

const test = ava as TestFn<{
  app: INestApplication;
  client: PrismaClient;
  auth: AuthService;
  mail: MailService;
}>;

test.beforeEach(async t => {
  const client = new PrismaClient();
  t.context.client = client;
  await client.$connect();
  await client.user.deleteMany({});
  await client.snapshot.deleteMany({});
  await client.update.deleteMany({});
  await client.workspace.deleteMany({});
  await client.$disconnect();
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = module.createNestApplication();
  app.use(
    graphqlUploadExpress({
      maxFileSize: 10 * 1024 * 1024,
      maxFiles: 5,
    })
  );
  await app.init();

  const auth = module.get(AuthService);
  const mail = module.get(MailService);
  t.context.app = app;
  t.context.auth = auth;
  t.context.mail = mail;
});

test.afterEach(async t => {
  await t.context.app.close();
});

test('change email', async t => {
  const { mail, app } = t.context;
  if (mail.hasConfigured()) {
    const u1Email = 'u1@affine.pro';
    const u2Email = 'u2@affine.pro';
    const tokenRegex = /token=3D([^"&\s]+)/;

    const u1 = await signUp(app, 'u1', u1Email, '1');

    await createWorkspace(app, u1.token.token);

    const primitiveMailCount = await getCurrentMailMessageCount();

    await sendChangeEmail(app, u1.token.token, u1Email, 'affine.pro');

    const afterSendChangeMailCount = await getCurrentMailMessageCount();
    t.is(
      primitiveMailCount + 1,
      afterSendChangeMailCount,
      'failed to send change email'
    );
    const changeEmailContent = await getLatestMailMessage();

    const changeTokenMatch = changeEmailContent.Content.Body.match(tokenRegex);
    const changeEmailToken = changeTokenMatch
      ? decodeURIComponent(changeTokenMatch[1].replace(/=3D/g, '='))
      : null;

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
    const verifyEmailContent = await getLatestMailMessage();

    const verifyTokenMatch = verifyEmailContent.Content.Body.match(tokenRegex);
    const verifyEmailToken = verifyTokenMatch
      ? decodeURIComponent(verifyTokenMatch[1].replace(/=3D/g, '='))
      : null;

    t.not(
      verifyEmailToken,
      null,
      'fail to get verify change email token from email content'
    );

    await changeEmail(app, u1.token.token, verifyEmailToken as string);

    const afterNotificationMailCount = await getCurrentMailMessageCount();

    t.is(
      afterSendVerifyMailCount + 1,
      afterNotificationMailCount,
      'failed to send notification email'
    );
  }
  t.pass();
});
