import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashSync } from '@node-rs/argon2';
import { type User } from '@prisma/client';
import ava, { type TestFn } from 'ava';
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';

import { AppModule } from '../src/app';
import { MailService } from '../src/modules/auth/mailer';
import { PrismaService } from '../src/prisma';
import { createWorkspace, getInviteInfo, inviteUser, signUp } from './utils';

const FakePrisma = {
  fakeUser: {
    id: randomUUID(),
    name: 'Alex Yang',
    avatarUrl: '',
    email: 'alex.yang@example.org',
    password: hashSync('123456'),
    emailVerified: new Date(),
    createdAt: new Date(),
  } satisfies User,

  get user() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const prisma = this;
    return {
      async findFirst() {
        return null;
      },
      async create({ data }: any) {
        return {
          ...prisma.fakeUser,
          ...data,
        };
      },
      async findUnique() {
        return prisma.fakeUser;
      },
    };
  },
  get workspace() {
    return {
      id: randomUUID(),
      async create({ data }: any) {
        return {
          id: this.id,
          public: data.public ?? false,
          createdAt: new Date(),
        };
      },
    };
  },
  snapshot: {
    id: randomUUID(),
    async create() {},
    async findFirstOrThrow() {
      return { id: this.id, blob: Buffer.from([0, 0]) };
    },
  },
  get workspaceUserPermission() {
    return {
      id: randomUUID(),
      prisma: this,
      async count() {
        return 1;
      },
      async create() {
        return { id: this.id };
      },
      async findUniqueOrThrow() {
        return { id: this.id, workspaceId: this.prisma.workspace.id };
      },
      async findFirst() {
        return { id: this.id };
      },
      async findFirstOrThrow() {
        return { id: this.id, user: this.prisma.fakeUser };
      },
      async workspaceUserPermission() {
        return {
          id: randomUUID(),
          createdAt: new Date(),
        };
      },
    };
  },
};

const test = ava as TestFn<{
  app: INestApplication;
  mail: MailService;
}>;

test.beforeEach(async t => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(FakePrisma)
    .compile();
  const app = module.createNestApplication();
  app.use(
    graphqlUploadExpress({
      maxFileSize: 10 * 1024 * 1024,
      maxFiles: 5,
    })
  );
  await app.init();

  const mail = module.get(MailService);
  t.context.app = app;
  t.context.mail = mail;
});

test.afterEach.always(async t => {
  await t.context.app.close();
});

test('should send invite email', async t => {
  const { mail, app } = t.context;
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

    t.is(resp.accepted.length, 1, 'failed to send invite email');
  }
  t.pass();
});
