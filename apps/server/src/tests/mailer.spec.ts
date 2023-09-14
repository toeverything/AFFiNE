import { ok } from 'node:assert';
import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hashSync } from '@node-rs/argon2';
import { User } from '@prisma/client';
import test from 'ava';
// @ts-expect-error graphql-upload is not typed
import graphqlUploadExpress from 'graphql-upload/graphqlUploadExpress.mjs';

import { AppModule } from '../app';
import { MailService } from '../modules/auth/mailer';
import { PrismaService } from '../prisma';
import { createWorkspace, getInviteInfo, inviteUser, signUp } from './utils';

let app: INestApplication;

let mail: MailService;

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
  get userWorkspacePermission() {
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
      async userWorkspacePermission() {
        return {
          id: randomUUID(),
          createdAt: new Date(),
        };
      },
    };
  },
};

test.beforeEach(async () => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue(FakePrisma)
    .compile();
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

test.afterEach.always(async () => {
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
