import { randomUUID } from 'node:crypto';

import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';

import { createTestingModule, type TestingModule } from '../../__tests__/utils';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { Models } from '../../models';
import { BackfillPermissionProjection1765500000000 } from '../migrations/1765500000000-backfill-permission-projection';
import { BackfillTranscriptStorageKeys1786805802350 } from '../migrations/1786805802350-backfill-transcript-storage-keys';
import { ConvergeManagedProviderProfiles1786810000000 } from '../migrations/1786810000000-converge-managed-provider-profiles';
import { MigrateLegacyContextBlobArtifacts1786820000000 } from '../migrations/1786820000000-migrate-legacy-context-blob-artifacts';

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

test('managed provider migration preserves explicit profiles and converts legacy keys atomically', async t => {
  t.teardown(async () => {
    await t.context.db.appConfig.deleteMany({
      where: { id: { startsWith: 'copilot.providers.' } },
    });
  });
  const profiles = [
    {
      id: 'openai-default',
      type: 'openai',
      priority: 7,
      config: { apiKey: 'profile-key' },
    },
  ];
  await t.context.db.appConfig.createMany({
    data: [
      { id: 'copilot.providers.profiles', value: profiles },
      {
        id: 'copilot.providers.openai',
        value: { apiKey: 'shadowed-legacy-key' },
      },
      {
        id: 'copilot.providers.gemini',
        value: { apiKey: 'gemini-key' },
      },
      {
        id: 'copilot.providers.defaults',
        value: { fallback: 'openai-default' },
      },
    ],
  });

  await ConvergeManagedProviderProfiles1786810000000.up(t.context.db);
  await ConvergeManagedProviderProfiles1786810000000.up(t.context.db);

  const migrated = await t.context.db.appConfig.findUniqueOrThrow({
    where: { id: 'copilot.providers.profiles' },
  });
  t.deepEqual(migrated.value, [
    ...profiles,
    {
      id: 'gemini-default',
      type: 'gemini',
      priority: 4,
      config: { apiKey: 'gemini-key' },
    },
  ]);
  t.is(
    await t.context.db.appConfig.count({
      where: {
        id: {
          in: ['copilot.providers.openai', 'copilot.providers.gemini'],
        },
      },
    }),
    0
  );
  t.truthy(
    await t.context.db.appConfig.findUnique({
      where: { id: 'copilot.providers.defaults' },
    })
  );

  await t.context.db.appConfig.update({
    where: { id: 'copilot.providers.profiles' },
    data: { value: [{ ...profiles[0], enabled: 'true' }] },
  });
  await t.context.db.appConfig.create({
    data: {
      id: 'copilot.providers.fal',
      value: { apiKey: 'fal-key' },
    },
  });
  await t.throwsAsync(() =>
    ConvergeManagedProviderProfiles1786810000000.up(t.context.db)
  );
  t.truthy(
    await t.context.db.appConfig.findUnique({
      where: { id: 'copilot.providers.fal' },
    })
  );
});

test('legacy context blob migration admits each blob once through the artifact runtime', async t => {
  const user = await t.context.models.user.create({
    email: 'legacy-context@affine.pro',
  });
  const workspace = await t.context.db.workspace.create({
    data: { accessPolicy: { create: {} } },
  });
  const session = await t.context.db.aiSession.create({
    data: {
      userId: user.id,
      workspaceId: workspace.id,
      promptName: 'copilot',
    },
  });
  const blobId = 'legacy-context-blob';
  const legacyTable = await t.context.db.$queryRaw<{ exists: boolean }[]>`
    SELECT to_regclass('public.ai_contexts') IS NOT NULL AS exists
  `;
  const createdLegacyTable = !legacyTable[0]?.exists;
  if (createdLegacyTable) {
    await t.context.db.$executeRaw`
      CREATE TABLE ai_contexts (
        id VARCHAR PRIMARY KEY,
        session_id VARCHAR NOT NULL,
        config JSON NOT NULL,
        created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ(3) NOT NULL
      )
    `;
  }
  await t.context.db.blob.create({
    data: {
      workspaceId: workspace.id,
      key: blobId,
      size: 12,
      mime: 'text/plain',
      status: 'completed',
    },
  });
  await t.context.db.$executeRaw`
    INSERT INTO ai_contexts (id, session_id, config, created_at, updated_at)
    VALUES (${randomUUID()}, ${session.id}, ${JSON.stringify({ blobs: [blobId] })}::jsonb, now(), now())
  `;

  const calls: Array<{
    workspaceId: string;
    blobId: string;
    mimeType: string;
    libraryOwned?: boolean;
  }> = [];
  const runtime = {
    async ensureWorkspaceBlobArtifact(input: (typeof calls)[number]) {
      calls.push(input);
      await t.context.db.$executeRaw`
        INSERT INTO workspace_artifacts (
          id, workspace_id, content_hash, canonical_media_type, size_bytes,
          storage_scope, storage_key, status, ready_at
        ) VALUES (
          ${randomUUID()}::uuid, ${input.workspaceId}, ${`hash-${input.blobId}`},
          ${input.mimeType}, 12, 'blob',
          ${`${input.workspaceId}/${input.blobId}`}, 'ready', now()
        )
      `;
      return {};
    },
  };
  const ref = {
    get(token: unknown) {
      if (token === BackendRuntimeProvider) {
        return runtime;
      }
      throw new Error('unexpected migration dependency');
    },
  } as unknown as ModuleRef;

  try {
    await MigrateLegacyContextBlobArtifacts1786820000000.up(t.context.db, ref);
    await MigrateLegacyContextBlobArtifacts1786820000000.up(t.context.db, ref);
  } finally {
    if (createdLegacyTable) {
      await t.context.db.$executeRaw`DROP TABLE ai_contexts`;
    }
  }

  t.deepEqual(calls, [
    {
      workspaceId: workspace.id,
      blobId,
      mimeType: 'text/plain',
      libraryOwned: false,
    },
  ]);
});
