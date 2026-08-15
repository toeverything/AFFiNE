import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';

import { createTestingModule, type TestingModule } from '../../__tests__/utils';
import { Models } from '../../models';
import { BackfillPermissionProjection1765500000000 } from '../migrations/1765500000000-backfill-permission-projection';
import { BackfillTranscriptStorageKeys1786805802350 } from '../migrations/1786805802350-backfill-transcript-storage-keys';

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
    data: { accessPolicy: { create: {} } },
  });
  const member = await t.context.models.user.create({
    email: 'member@affine.pro',
  });
  const memberWorkspace = await t.context.db.workspace.create({
    data: { accessPolicy: { create: {} } },
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
});

test('transcript backfill adds stable keys without removing compatibility URLs', async t => {
  const payload = {
    sourceAudio: { blobId: 'blob-1' },
    infos: [
      {
        url: 'https://affine.example/api/copilot/blob/user-1/workspace-1/blob-1',
        mimeType: 'audio/m4a',
      },
      {
        url: 'https://example.com/external.m4a',
        mimeType: 'audio/m4a',
      },
    ],
  };
  await t.context.db.aiTranscriptTask.create({
    data: {
      userId: 'user-1',
      workspaceId: 'workspace-1',
      blobId: 'blob-1',
      status: 'failed',
      recipeId: 'transcript.audio',
      recipeVersion: 'v1',
      inputSnapshot: payload,
      protectedResult: payload,
    },
  });

  await BackfillTranscriptStorageKeys1786805802350.up(t.context.db);
  await BackfillTranscriptStorageKeys1786805802350.up(t.context.db);

  const task = await t.context.db.aiTranscriptTask.findFirstOrThrow({
    where: { blobId: 'blob-1' },
  });
  const expected = {
    ...payload,
    infos: [{ ...payload.infos[0], key: 'blob-1' }, payload.infos[1]],
  };
  t.deepEqual(task.inputSnapshot, expected);
  t.deepEqual(task.protectedResult, expected);
});
