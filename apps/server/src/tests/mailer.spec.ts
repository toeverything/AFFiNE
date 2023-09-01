import { ok } from 'node:assert';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import test from 'ava';
// @ts-expect-error graphql-upload is not typed
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';

import { AppModule } from '../app';
import { MailService } from '../modules/auth/mailer';
import { createWorkspace, getInviteInfo, inviteUser, signUp } from './utils';

let app: INestApplication;

const client = new PrismaClient();

let mail: MailService;

// cleanup database before each test
test.beforeEach(async () => {
  await client.$connect();
  await client.user.deleteMany({});
  await client.snapshot.deleteMany({});
  await client.update.deleteMany({});
  await client.workspace.deleteMany({});
  await client.$disconnect();
});

test.beforeEach(async () => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication();
  app.use(
    graphqlUploadExpress({
      maxFileSize: 10 * 1024 * 1024,
      maxFiles: 5,
    })
  );
  await app.init();

  mail = module.get(MailService);
});

test.afterEach(async () => {
  await app.close();
});

test('should send invite email', async t => {
  if (mail.hasConfigured()) {
    const u1 = await signUp(app, 'u1', 'u1@affine.pro', '1');
    const u2 = await signUp(app, 'u2', 'u2@affine.pro', '1');

    const workspace = await createWorkspace(app, u1.token.token);
    const inviteId = await inviteUser(
      app,
      u1.token.token,
      workspace.id,
      u2.email,
      'Admin'
    );

    const inviteInfo = await getInviteInfo(app, u1.token.token, inviteId);

    const resp = await mail.sendInviteEmail(
      'production@toeverything.info',
      inviteId,
      {
        workspace: {
          id: inviteInfo.workspace.id,
          name: inviteInfo.workspace.name,
          avatar: '',
        },
        user: {
          avatar: inviteInfo.user?.avatarUrl || '',
          name: inviteInfo.user?.name || '',
        },
      }
    );

    ok(resp.accepted.length === 1, 'failed to send invite email');
  }
  t.pass();
});
