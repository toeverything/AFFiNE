import { randomUUID } from 'node:crypto';

import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';

import { createTestingModule, type TestingModule } from '../../__tests__/utils';
import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { Models } from '../../models';
import { CutoverCommand } from '../commands/cutover';
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

test('permission backfill repairs ownerless workspaces', async t => {
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
      id: 'cloudflare-existing',
      type: 'cloudflareWorkersAi',
      priority: 7,
      models: ['@cf/baai/bge-reranker-base'],
      config: { apiKey: 'profile-key' },
    },
    {
      id: 'fal-default',
      type: 'fal',
      priority: 5,
      config: { apiKey: 'existing-fal-key' },
    },
    {
      id: 'anthropic-default',
      type: 'anthropic',
      priority: 2,
      config: { apiKey: 'existing-anthropic-key' },
    },
    {
      id: 'anthropicVertex-default',
      type: 'anthropicVertex',
      priority: 1,
      config: { projectId: 'existing-anthropic-vertex-project' },
    },
  ];
  await t.context.db.appConfig.createMany({
    data: [
      { id: 'copilot.providers.profiles', value: profiles },
      {
        id: 'copilot.providers.openai',
        value: { apiKey: 'openai-key' },
      },
      {
        id: 'copilot.providers.cloudflareWorkersAi',
        value: { apiKey: 'legacy-cloudflare-key' },
      },
      {
        id: 'copilot.providers.gemini',
        value: { apiKey: 'gemini-key' },
      },
      {
        id: 'copilot.providers.geminiVertex',
        value: { projectId: 'gemini-vertex-project' },
      },
      {
        id: 'copilot.providers.fal',
        value: { apiKey: 'legacy-fal-key' },
      },
      {
        id: 'copilot.providers.anthropic',
        value: { apiKey: 'legacy-anthropic-key' },
      },
      {
        id: 'copilot.providers.anthropicVertex',
        value: { projectId: 'legacy-anthropic-vertex-project' },
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
    profiles[0],
    {
      ...profiles[1],
      models: ['lora/image-to-image', 'workflowutils/teed'],
    },
    {
      ...profiles[2],
      models: ['claude-sonnet-4-6'],
    },
    {
      ...profiles[3],
      models: ['claude-sonnet-4-6'],
      enabled: false,
    },
    {
      id: 'openai-default',
      type: 'openai',
      priority: 7,
      models: ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-image-1', 'gpt-4o-mini'],
      config: { apiKey: 'openai-key' },
    },
    {
      id: 'cloudflareWorkersAi-default',
      type: 'cloudflareWorkersAi',
      priority: 6,
      models: ['@cf/baai/bge-reranker-base'],
      config: { apiKey: 'legacy-cloudflare-key' },
      enabled: false,
    },
    {
      id: 'gemini-default',
      type: 'gemini',
      priority: 4,
      models: ['gemini-3.7-flash', 'gemini-embedding-001'],
      config: { apiKey: 'gemini-key' },
    },
    {
      id: 'geminiVertex-default',
      type: 'geminiVertex',
      priority: 3,
      models: ['gemini-3.7-flash'],
      config: { projectId: 'gemini-vertex-project' },
      enabled: false,
    },
  ]);
  t.is(
    await t.context.db.appConfig.count({
      where: {
        id: {
          in: [
            'copilot.providers.openai',
            'copilot.providers.cloudflareWorkersAi',
            'copilot.providers.gemini',
            'copilot.providers.geminiVertex',
            'copilot.providers.fal',
            'copilot.providers.anthropic',
            'copilot.providers.anthropicVertex',
          ],
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
  await t.context.db.appConfig.delete({
    where: { id: 'copilot.providers.defaults' },
  });

  const defaultOnlyProfiles = profiles.slice(1);
  await t.context.db.appConfig.update({
    where: { id: 'copilot.providers.profiles' },
    data: { value: defaultOnlyProfiles },
  });
  await ConvergeManagedProviderProfiles1786810000000.up(t.context.db);
  t.deepEqual(
    (
      await t.context.db.appConfig.findUniqueOrThrow({
        where: { id: 'copilot.providers.profiles' },
      })
    ).value,
    [
      {
        ...defaultOnlyProfiles[0],
        models: ['lora/image-to-image', 'workflowutils/teed'],
      },
      {
        ...defaultOnlyProfiles[1],
        models: ['claude-sonnet-4-6'],
      },
      {
        ...defaultOnlyProfiles[2],
        models: ['claude-sonnet-4-6'],
        enabled: false,
      },
    ]
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
    const ref = {
      get() {
        throw new Error(
          'legacy context runtime should not be resolved without source tables'
        );
      },
    } as unknown as ModuleRef;
    await MigrateLegacyContextBlobArtifacts1786820000000.up(t.context.db, ref);
  }
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

test('mixed-version cutover keeps legacy writes readable and rejects malformed canonical rows', async t => {
  const owner = await t.context.models.user.create({
    email: `${randomUUID()}@affine.pro`,
  });
  const workspace = await t.context.models.workspace.create(owner.id);
  const oldBlobKey = `old-${randomUUID()}`;
  const oldAttachmentKey = `old-${randomUUID()}`;
  await t.context.db.$executeRaw`
    INSERT INTO blobs (workspace_id, key, size, mime, status, created_at)
    VALUES (
      ${workspace.id}, ${oldBlobKey}, 12, 'application/octet-stream',
      'completed'::"BlobStatus", now()
    )
  `;
  await t.context.db.$executeRaw`
    INSERT INTO comment_attachments (
      workspace_id, doc_id, key, size, mime, name, created_at
    ) VALUES (
      ${workspace.id}, 'doc', ${oldAttachmentKey}, 8,
      'text/plain', 'old.txt', now()
    )
  `;

  const newBlobKey = `new-${randomUUID()}`;
  const newAttachmentKey = `new-${randomUUID()}`;
  await t.context.db.blob.create({
    data: {
      workspaceId: workspace.id,
      key: newBlobKey,
      size: 16,
      mime: 'application/octet-stream',
      status: 'pending',
      reservationExpiresAt: new Date(Date.now() + 60_000),
    },
  });
  await t.context.db.commentAttachment.create({
    data: {
      workspaceId: workspace.id,
      docId: 'doc',
      key: newAttachmentKey,
      size: 10,
      mime: 'text/plain',
      name: 'new.txt',
      status: 'pending',
      reservationExpiresAt: new Date(Date.now() + 60_000),
    },
  });

  const oldReaderBlobs = await t.context.db.$queryRaw<
    Array<{ key: string; size: number; mime: string; status: string }>
  >`
    SELECT key, size, mime, status::text AS status
    FROM blobs
    WHERE workspace_id = ${workspace.id}
    ORDER BY key
  `;
  const oldReaderAttachments = await t.context.db.$queryRaw<
    Array<{
      docId: string;
      key: string;
      size: number;
      mime: string;
      name: string;
    }>
  >`
    SELECT doc_id AS "docId", key, size, mime, name
    FROM comment_attachments
    WHERE workspace_id = ${workspace.id}
    ORDER BY key
  `;
  const newReaderBlobs = await t.context.db.blob.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { key: 'asc' },
  });
  const newReaderAttachments = await t.context.db.commentAttachment.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { key: 'asc' },
  });
  const typeRows = await t.context.db.$queryRaw<Array<{ name: string }>>`
    SELECT typname AS name
    FROM pg_type
    WHERE typname = 'BlobStatus'
  `;
  const sourceDocId = `source-${randomUUID()}`;
  const sourceTimestamp = new Date(Date.now() - 60_000);
  await t.context.db.$executeRaw`
    INSERT INTO snapshots (workspace_id, guid, blob, updated_at)
    VALUES (${workspace.id}, ${sourceDocId}, decode('00', 'hex'), ${sourceTimestamp})
  `;
  await t.context.db.$executeRaw`
    UPDATE snapshots
    SET blob = decode('01', 'hex'), updated_at = ${sourceTimestamp}
    WHERE workspace_id = ${workspace.id} AND guid = ${sourceDocId}
  `;
  const [advancedSnapshot] = await t.context.db.$queryRaw<
    Array<{ updatedAt: Date }>
  >`
    SELECT updated_at AS "updatedAt"
    FROM snapshots
    WHERE workspace_id = ${workspace.id} AND guid = ${sourceDocId}
  `;
  await t.context.db.$executeRaw`
    INSERT INTO updates (workspace_id, guid, blob, created_at)
    VALUES (${workspace.id}, ${sourceDocId}, decode('00', 'hex'), ${sourceTimestamp})
  `;
  await t.context.db.$executeRaw`
    INSERT INTO snapshot_histories (
      workspace_id, guid, timestamp, blob, expired_at
    ) VALUES (
      ${workspace.id}, ${sourceDocId}, ${sourceTimestamp}, decode('00', 'hex'),
      ${new Date(Date.now() + 60_000)}
    )
  `;
  const updateImmutable = await t.throwsAsync(
    t.context.db.$executeRaw`
      UPDATE updates SET blob = decode('01', 'hex')
      WHERE workspace_id = ${workspace.id} AND guid = ${sourceDocId}
    `
  );
  const historyImmutable = await t.throwsAsync(
    t.context.db.$executeRaw`
      UPDATE snapshot_histories SET blob = decode('01', 'hex')
      WHERE workspace_id = ${workspace.id} AND guid = ${sourceDocId}
    `
  );

  const legacyUserId = randomUUID();
  const legacySessionId = randomUUID();
  const legacyUserSessionId = randomUUID();
  const legacyAuthSessionId = randomUUID();
  const legacySubscriptionId = randomUUID();
  const legacyEventId = randomUUID();
  await t.context.db.$executeRaw`
    INSERT INTO users (id, name, email, password)
    VALUES (
      ${legacyUserId}, 'legacy client',
      ${`${legacyUserId}@affine.pro`}, 'legacy-password-hash'
    )
  `;
  await t.context.db.$executeRaw`
    INSERT INTO user_connected_accounts (
      id, user_id, provider, provider_account_id, scope,
      access_token, refresh_token, expires_at, created_at, updated_at
    ) VALUES (
      ${randomUUID()}, ${legacyUserId}, 'github', ${`subject-${legacyUserId}`},
      'read:user', 'legacy-access', 'legacy-refresh', now() + interval '1 day',
      now(), now()
    )
  `;
  await t.context.db.$executeRaw`
    INSERT INTO multiple_users_sessions (id) VALUES (${legacySessionId})
  `;
  await t.context.db.$executeRaw`
    INSERT INTO user_sessions (id, session_id, user_id)
    VALUES (${legacyUserSessionId}, ${legacySessionId}, ${legacyUserId})
  `;
  await t.context.db.$executeRaw`
    INSERT INTO auth_sessions (
      id, user_session_id, installation_id, platform,
      idle_expires_at, absolute_expires_at
    ) VALUES (
      ${legacyAuthSessionId}, ${legacyUserSessionId}, ${randomUUID()}, 'ios',
      now() + interval '1 day', now() + interval '30 days'
    )
  `;
  await t.context.db.$executeRaw`
    INSERT INTO auth_refresh_tokens (
      id, auth_session_id, generation, secret_hash, expires_at
    ) VALUES (
      ${randomUUID()}, ${legacyAuthSessionId}, 0, 'legacy-secret-hash',
      now() + interval '30 days'
    )
  `;
  await t.context.db.$executeRaw`
    INSERT INTO provider_subscriptions (
      id, provider, target_type, target_id, plan, recurring, status,
      external_customer_id, external_subscription_id, metadata, updated_at
    ) VALUES (
      ${legacySubscriptionId}, 'stripe'::"Provider", 'user', ${legacyUserId},
      'pro', 'yearly', 'active', ${`cus-${legacyUserId}`},
      ${`sub-${legacyUserId}`}, '{}'::jsonb, now()
    )
  `;
  await t.context.db.$executeRaw`
    INSERT INTO payment_events (
      id, provider, event_type, external_event_id,
      processing_status, metadata, updated_at
    ) VALUES (
      ${legacyEventId}, 'stripe'::"Provider", 'customer.subscription.updated',
      ${`evt-${legacyUserId}`}, 'pending', '{}'::jsonb, now()
    )
  `;
  const [legacyCompatibility] = await t.context.db.$queryRaw<
    Array<{
      authEpoch: number;
      accountNamespace: string | null;
      sourceNamespace: string | null;
      sourceIdentity: string | null;
      successorCiphertext: string | null;
      successorExpiresAt: Date | null;
      eventNamespace: string | null;
      nextAttemptAt: Date | null;
    }>
  >`
    SELECT
      u.auth_epoch AS "authEpoch",
      a.provider_namespace AS "accountNamespace",
      ps.provider_namespace AS "sourceNamespace",
      ps.source_identity AS "sourceIdentity",
      rt.successor_ciphertext AS "successorCiphertext",
      rt.successor_expires_at AS "successorExpiresAt",
      pe.provider_namespace AS "eventNamespace",
      pe.next_attempt_at AS "nextAttemptAt"
    FROM users u
    JOIN user_connected_accounts a ON a.user_id = u.id
    JOIN provider_subscriptions ps ON ps.target_id = u.id
    JOIN user_sessions us ON us.user_id = u.id
    JOIN auth_sessions s ON s.user_session_id = us.id
    JOIN auth_refresh_tokens rt ON rt.auth_session_id = s.id
    JOIN payment_events pe ON pe.id = ${legacyEventId}
    WHERE u.id = ${legacyUserId}
  `;

  const unsigned = await t.context.db.entitlement.create({
    data: {
      targetType: 'workspace',
      targetId: workspace.id,
      source: 'selfhost_license',
      plan: 'selfhost_team',
      status: 'active',
    },
  });
  const command = new CutoverCommand(t.context.db);
  const malformedKey = `malformed-${randomUUID()}`;
  const malformedAttachmentKey = `malformed-attachment-${randomUUID()}`;
  await t.context.db.$executeRaw`
    INSERT INTO blobs (
      workspace_id, key, size, mime, status, reservation_expires_at
    ) VALUES (
      ${workspace.id}, ${malformedKey}, 1, 'application/octet-stream',
      'pending'::"BlobStatus", NULL
    )
  `;
  await t.context.db.$executeRaw`
    INSERT INTO comment_attachments (
      workspace_id, doc_id, key, size, mime, name, status,
      reservation_expires_at
    ) VALUES (
      ${workspace.id}, 'doc', ${malformedAttachmentKey}, 1, 'text/plain',
      'malformed.txt', 'pending'::"BlobStatus", NULL
    )
  `;

  const passed = await command.execute('selfhosted');
  const normalizedBlob = await t.context.db.blob.findFirstOrThrow({
    where: { workspaceId: workspace.id, key: malformedKey },
    select: { status: true, deletedAt: true },
  });
  const normalizedAttachment =
    await t.context.db.commentAttachment.findFirstOrThrow({
      where: {
        workspaceId: workspace.id,
        docId: 'doc',
        key: malformedAttachmentKey,
      },
      select: { status: true, deletedAt: true },
    });
  const normalized = {
    entitlement: await t.context.db.entitlement.findUniqueOrThrow({
      where: { id: unsigned.id },
      select: { status: true },
    }),
    blob: {
      status: normalizedBlob.status,
      deleted: normalizedBlob.deletedAt !== null,
    },
    attachment: {
      status: normalizedAttachment.status,
      deleted: normalizedAttachment.deletedAt !== null,
    },
  };

  await t.context.db.workspace.create({
    data: { accessPolicy: { create: {} } },
  });
  const rollbackCandidate = await t.context.db.entitlement.create({
    data: {
      targetType: 'workspace',
      targetId: workspace.id,
      source: 'selfhost_license',
      plan: 'selfhost_team',
      status: 'active',
    },
  });
  const failure = await t.throwsAsync(command.execute('selfhosted'));
  const rolledBack = await t.context.db.entitlement.findUniqueOrThrow({
    where: { id: rollbackCandidate.id },
    select: { status: true },
  });

  const normalizeKey = (key: string) =>
    key === oldBlobKey || key === oldAttachmentKey ? 'old' : 'new';
  t.snapshot({
    enumTypes: typeRows,
    oldReader: {
      blobs: oldReaderBlobs.map(row => ({
        ...row,
        key: normalizeKey(row.key),
      })),
      attachments: oldReaderAttachments.map(row => ({
        ...row,
        key: normalizeKey(row.key),
      })),
    },
    newReader: {
      blobs: newReaderBlobs.map(row => ({
        key: normalizeKey(row.key),
        status: row.status,
        hasReservation:
          row.reservationId !== null &&
          /^[0-9a-f-]{36}$/.test(row.reservationId),
        expires: row.reservationExpiresAt !== null,
        deleted: row.deletedAt !== null,
      })),
      attachments: newReaderAttachments.map(row => ({
        key: normalizeKey(row.key),
        status: row.status,
        hasReservation:
          row.reservationId !== null &&
          /^[0-9a-f-]{36}$/.test(row.reservationId),
        expires: row.reservationExpiresAt !== null,
        deleted: row.deletedAt !== null,
      })),
    },
    cutover: {
      passed,
      normalized,
      failure: failure?.message,
      rolledBack,
    },
    sourceTimestamps: {
      snapshotAdvanced:
        advancedSnapshot.updatedAt.getTime() > sourceTimestamp.getTime(),
      updateImmutable: updateImmutable?.message.includes(
        'updates source content is immutable'
      ),
      historyImmutable: historyImmutable?.message.includes(
        'snapshot_histories source content is immutable'
      ),
    },
    legacyCompatibility,
  });
});
