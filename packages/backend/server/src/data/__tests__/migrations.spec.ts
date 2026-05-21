import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';

import { createTestingModule, type TestingModule } from '../../__tests__/utils';
import { Models } from '../../models';
import { BackfillPermissionProjection1765500000000 } from '../migrations/1765500000000-backfill-permission-projection';

interface Context {
  module: TestingModule;
  db: PrismaClient;
  models: Models;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  t.context.module = await createTestingModule();
  t.context.db = t.context.module.get(PrismaClient);
  t.context.models = t.context.module.get(Models);
});

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
});

test.after.always(async t => {
  await t.context.module.close();
});

test('permission backfill repairs ownerless workspaces before runtime state projection', async t => {
  const emptyWorkspace = await t.context.db.workspace.create({
    data: { public: false },
  });
  const member = await t.context.models.user.create({
    email: 'member@affine.pro',
  });
  const memberWorkspace = await t.context.db.workspace.create({
    data: { public: false },
  });
  await t.context.db.workspaceMember.create({
    data: {
      workspaceId: memberWorkspace.id,
      userId: member.id,
      role: 'member',
      state: 'active',
      source: 'legacy',
    },
  });

  const ref = {
    get(token: unknown) {
      if (token === Models) {
        return t.context.models;
      }
      return {
        async getWorkspaceState() {
          return {
            isReadonly: false,
            readonlyReasons: [],
          };
        },
      };
    },
  } as unknown as ModuleRef;

  await BackfillPermissionProjection1765500000000.up(t.context.db, ref);

  t.is(
    await t.context.db.workspace.count({ where: { id: emptyWorkspace.id } }),
    0
  );
  t.like(
    await t.context.db.workspaceMember.findFirstOrThrow({
      where: {
        workspaceId: memberWorkspace.id,
        userId: member.id,
        state: 'active',
      },
    }),
    { role: 'owner' }
  );
  t.like(
    await t.context.db.workspaceUserRole.findFirstOrThrow({
      where: {
        workspaceId: memberWorkspace.id,
        userId: member.id,
      },
    }),
    { type: 99 }
  );
});
