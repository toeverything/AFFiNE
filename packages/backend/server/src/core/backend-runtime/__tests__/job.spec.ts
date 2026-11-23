import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ScheduleModule } from '@nestjs/schedule';
import { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';
import Sinon from 'sinon';
import {
  applyUpdate,
  Array as YArray,
  Doc,
  encodeStateAsUpdate,
  encodeStateVector,
  Map as YMap,
  mergeUpdates,
  Text as YText,
} from 'yjs';

import {
  createTestingModule,
  type TestingModule,
} from '../../../__tests__/utils';
import {
  CopilotSelectedSourcesFailed,
  CopilotSelectedSourcesLimitExceeded,
  CopilotSelectedSourcesProcessing,
  CopilotSelectedSourcesUnavailable,
  DocUpdateInvalid,
  EventBus,
} from '../../../base';
import { Models } from '../../../models';
import { ServerConfigHandle } from '../../../native';
import {
  DatabaseDocReader,
  DocStorageModule,
  DocStorageOptions,
} from '../../doc';
import { DocJobRunner } from '../../doc-jobs/job';
import { StorageRuntimeProvider } from '../../storage-runtime';
import {
  BackendRuntimeModule,
  BackendRuntimeProvider,
  BackendRuntimeWorkerModule,
} from '../index';
import {
  BackendRuntimeEmbeddingService,
  BackendRuntimeHousekeepingJob,
  BackendRuntimeSearchJob,
} from '../job';

interface Context {
  module: TestingModule;
  embeddingService: BackendRuntimeEmbeddingService;
  job: BackendRuntimeHousekeepingJob;
  searchJob: BackendRuntimeSearchJob;
  getCurrentWorkspaceDocV1: Sinon.SinonStub;
  allowEmbedding: Sinon.SinonStub;
  runtime: {
    getCurrentWorkspaceDocV1: Sinon.SinonStub;
    ensureWorkspaceLifecycleV1: Sinon.SinonStub;
    nodeCryptoPrivateKey: Sinon.SinonStub;
    cleanupExpiredRuntimeStates: Sinon.SinonStub;
    cleanupExpiredRuntimeGates: Sinon.SinonStub;
    cleanupExpiredRollingQuota: Sinon.SinonStub;
    cleanupUnreferencedArtifacts: Sinon.SinonStub;
    embeddingHealth: Sinon.SinonStub;
    syncEmbeddingState: Sinon.SinonStub;
    executeAuthSessionCommandV1: Sinon.SinonStub;
    searchEnabled: Sinon.SinonStub;
    reconcileSearchProjection: Sinon.SinonStub;
    searchStatus: Sinon.SinonStub;
  };
}

const test = ava.serial as TestFn<Context>;

test.before(async t => {
  const snapshot = readFileSync(
    join(process.cwd(), 'src/__tests__/__fixtures__/test-doc.snapshot.bin')
  );
  t.context.runtime = {
    getCurrentWorkspaceDocV1: Sinon.stub(),
    ensureWorkspaceLifecycleV1: Sinon.stub().resolves(),
    nodeCryptoPrivateKey: Sinon.stub().returns(''),
    cleanupExpiredRuntimeStates: Sinon.stub(),
    cleanupExpiredRuntimeGates: Sinon.stub(),
    cleanupExpiredRollingQuota: Sinon.stub(),
    cleanupUnreferencedArtifacts: Sinon.stub(),
    embeddingHealth: Sinon.stub().resolves({ enabled: true }),
    syncEmbeddingState: Sinon.stub(),
    executeAuthSessionCommandV1: Sinon.stub().resolves({}),
    searchEnabled: Sinon.stub().returns(false),
    reconcileSearchProjection: Sinon.stub().resolves(2),
    searchStatus: Sinon.stub().resolves({ ready: true, state: 'active' }),
  };
  t.context.module = await createTestingModule({
    imports: [
      ScheduleModule.forRoot(),
      BackendRuntimeModule,
      BackendRuntimeWorkerModule,
      DocStorageModule,
    ],
    tapModule: builder => {
      builder
        .overrideProvider(BackendRuntimeProvider)
        .useValue(t.context.runtime);
    },
  });
  const models = t.context.module.get(Models);
  t.context.getCurrentWorkspaceDocV1 =
    t.context.runtime.getCurrentWorkspaceDocV1.resolves({
      bin: snapshot,
      timestamp: new Date('2026-01-02T00:00:00Z').getTime(),
    });
  const root = new Doc();
  const pages = new YArray<YMap<unknown>>();
  root.getMap('meta').set('pages', pages);
  pages.push([new YMap([['id', 'doc-1']])]);
  t.context.getCurrentWorkspaceDocV1
    .withArgs('workspace-1', 'workspace-1')
    .resolves({
      bin: Buffer.from(encodeStateAsUpdate(root)),
      timestamp: new Date('2026-01-02T00:00:00Z').getTime(),
    });
  root.destroy();
  t.context.allowEmbedding = Sinon.stub(
    models.workspace,
    'allowEmbedding'
  ).resolves(true);
  t.context.embeddingService = t.context.module.get(
    BackendRuntimeEmbeddingService
  );
  t.context.job = t.context.module.get(BackendRuntimeHousekeepingJob);
  t.context.searchJob = t.context.module.get(BackendRuntimeSearchJob);
});

test.beforeEach(t => {
  t.context.runtime.cleanupExpiredRuntimeStates.reset();
  t.context.runtime.cleanupExpiredRuntimeGates.reset();
  t.context.runtime.cleanupExpiredRollingQuota.reset();
  t.context.runtime.cleanupUnreferencedArtifacts.reset();
  t.context.runtime.embeddingHealth.resetHistory();
  t.context.runtime.ensureWorkspaceLifecycleV1.resetHistory();
  t.context.runtime.syncEmbeddingState.reset();
  t.context.runtime.searchEnabled.resetHistory();
  t.context.runtime.reconcileSearchProjection.resetHistory();
  t.context.runtime.searchStatus.resetHistory();
  t.context.getCurrentWorkspaceDocV1.resetHistory();
  t.context.allowEmbedding.resetHistory();
});

test.after.always(async t => {
  Sinon.restore();
  await t.context.module?.close();
});

test('backend-runtime jobs ingest documents and clean runtime state', async t => {
  await t.context.embeddingService.syncDocument('workspace-1', 'doc-1', '1');
  t.is(t.context.getCurrentWorkspaceDocV1.callCount, 1);
  t.is(t.context.runtime.syncEmbeddingState.callCount, 1);
  t.like(t.context.runtime.syncEmbeddingState.firstCall.args[0], {
    workspaceId: 'workspace-1',
    enabled: true,
  });
  t.is(
    t.context.runtime.syncEmbeddingState.firstCall.args[0].documents[0].docId,
    'doc-1'
  );
  t.true(
    t.context.runtime.syncEmbeddingState.firstCall.args[0].documents[0].units
      .length > 0
  );

  await t.context.embeddingService.prepareSelectedDocuments('workspace-1', [
    'doc-1',
    'doc-1',
  ]);
  t.true(
    t.context.runtime.ensureWorkspaceLifecycleV1.calledOnceWithExactly(
      'workspace-1'
    )
  );
  t.like(t.context.runtime.syncEmbeddingState.secondCall.args[0], {
    workspaceId: 'workspace-1',
    enabled: true,
    priority: 1000,
    waitForReadyMs: 90_000,
  });
  t.is(
    t.context.runtime.syncEmbeddingState.secondCall.args[0].documents.length,
    1
  );

  const original = await t.context.getCurrentWorkspaceDocV1(
    'workspace-1',
    'doc-1'
  );
  const edited = new Doc();
  applyUpdate(edited, original.bin);
  const before = encodeStateVector(edited);
  const editedText = [...edited.getMap<YMap<unknown>>('blocks').values()]
    .map(block => block.get('prop:text'))
    .find((value): value is YText => value instanceof YText)!;
  editedText.insert(0, 'uncompacted-current-text ');
  const timestamp = original.timestamp + 1;
  t.context.getCurrentWorkspaceDocV1.withArgs('workspace-1', 'doc-1').resolves({
    bin: Buffer.from(
      mergeUpdates([original.bin, encodeStateAsUpdate(edited, before)])
    ),
    timestamp,
  });
  await t.context.embeddingService.prepareSelectedDocuments('workspace-1', [
    'doc-1',
  ]);
  const projected =
    t.context.runtime.syncEmbeddingState.lastCall.args[0].documents[0];
  t.is(projected.revision, timestamp.toString());
  t.true(
    projected.units.some((unit: { text: string }) =>
      unit.text.includes('uncompacted-current-text')
    )
  );
  t.context.getCurrentWorkspaceDocV1
    .withArgs('workspace-1', 'doc-1')
    .resolves(original);
  edited.destroy();

  for (const [nativeError, expectedError] of [
    ['embedding_selected_sources_processing', CopilotSelectedSourcesProcessing],
    ['embedding_selected_sources_failed', CopilotSelectedSourcesFailed],
    [
      'embedding_selected_sources_unavailable',
      CopilotSelectedSourcesUnavailable,
    ],
  ] as const) {
    t.context.runtime.syncEmbeddingState.rejects(new Error(nativeError));
    const error = await t.throwsAsync(() =>
      t.context.embeddingService.prepareSelectedDocuments('workspace-1', [
        'doc-1',
      ])
    );
    t.true(error instanceof expectedError);
  }
  t.context.runtime.syncEmbeddingState.resolves(undefined);

  await t.throwsAsync(
    () =>
      t.context.embeddingService.prepareSelectedDocuments(
        'workspace-1',
        Array.from({ length: 65 }, (_, index) => `doc-${index}`)
      ),
    { instanceOf: CopilotSelectedSourcesLimitExceeded }
  );
  const healthyRoot = await t.context.getCurrentWorkspaceDocV1(
    'workspace-1',
    'workspace-1'
  );
  const partialRoot = new Doc();
  partialRoot.getMap('meta').set('version', 1);
  const priorState = encodeStateVector(partialRoot);
  const rootPages = new YArray<YMap<unknown>>();
  partialRoot.getMap('meta').set('pages', rootPages);
  rootPages.push([
    new YMap<unknown>([
      ['id', 'doc-1'],
      ['trash', true],
    ]),
  ]);
  t.context.getCurrentWorkspaceDocV1
    .withArgs('workspace-1', 'workspace-1')
    .resolves({
      ...healthyRoot,
      bin: Buffer.from(encodeStateAsUpdate(partialRoot, priorState)),
    });
  await t.context.embeddingService.syncDocument('workspace-1', 'doc-1', '1');
  t.true(
    t.context.runtime.syncEmbeddingState.lastCall.args[0].documents[0].units
      .length > 0
  );
  partialRoot.destroy();
  t.context.getCurrentWorkspaceDocV1
    .withArgs('workspace-1', 'workspace-1')
    .resolves(healthyRoot);
  const healthySnapshot = await t.context.getCurrentWorkspaceDocV1(
    'workspace-1',
    'doc-1'
  );
  const viewOnly = new Doc();
  viewOnly.getMap('view').set('mode', 'page');
  const nulDoc = new Doc();
  applyUpdate(nulDoc, healthySnapshot.bin);
  const text = [...nulDoc.getMap<YMap<unknown>>('blocks').values()]
    .map(block => block.get('prop:text'))
    .find((value): value is YText => value instanceof YText)!;
  text.insert(0, '\0');
  for (const [blob, reason] of [
    [Buffer.from([0, 0]), 'empty_document'],
    [Buffer.from(encodeStateAsUpdate(viewOnly)), 'document_blocks_missing'],
    [Buffer.from(encodeStateAsUpdate(nulDoc)), 'document_contains_nul'],
  ] as const) {
    t.context.getCurrentWorkspaceDocV1
      .withArgs('workspace-1', 'doc-1')
      .resolves({ ...healthySnapshot, bin: blob });
    await t.context.embeddingService.syncDocument('workspace-1', 'doc-1', '1');
    t.like(t.context.runtime.syncEmbeddingState.lastCall.args[0].documents[0], {
      docId: 'doc-1',
      revision: healthySnapshot.timestamp.toString(),
      skipReason: reason,
      units: [],
    });
  }
  t.context.getCurrentWorkspaceDocV1
    .withArgs('workspace-1', 'doc-1')
    .rejects(new DocUpdateInvalid());
  await t.context.embeddingService.syncDocument(
    'workspace-1',
    'doc-1',
    'old-candidate'
  );
  t.like(t.context.runtime.syncEmbeddingState.lastCall.args[0].documents[0], {
    revision: 'old-candidate',
    skipReason: 'invalid_document',
    units: [],
  });
  await t.throwsAsync(
    () =>
      t.context.embeddingService.prepareSelectedDocuments('workspace-1', [
        'doc-1',
      ]),
    { instanceOf: CopilotSelectedSourcesFailed }
  );
  const databaseFailure = new Error('database unavailable');
  t.context.getCurrentWorkspaceDocV1
    .withArgs('workspace-1', 'doc-1')
    .rejects(databaseFailure);
  await t.throwsAsync(
    () =>
      t.context.embeddingService.syncDocument(
        'workspace-1',
        'doc-1',
        'old-candidate'
      ),
    { is: databaseFailure }
  );
  viewOnly.destroy();
  nulDoc.destroy();
  t.context.getCurrentWorkspaceDocV1
    .withArgs('workspace-1', 'doc-1')
    .resolves(healthySnapshot);
  await t.context.embeddingService.syncDocument('workspace-1', 'doc-1', '1');
  t.true(
    t.context.runtime.syncEmbeddingState.lastCall.args[0].documents[0].units
      .length > 0
  );
  t.context.getCurrentWorkspaceDocV1.resolves(null);
  await t.throwsAsync(
    () =>
      t.context.embeddingService.prepareSelectedDocuments('workspace-1', [
        'missing-doc',
      ]),
    { instanceOf: CopilotSelectedSourcesUnavailable }
  );
  const callsBeforeMissingBackgroundDoc =
    t.context.runtime.syncEmbeddingState.callCount;
  await t.context.embeddingService.syncDocument(
    'workspace-1',
    'missing-doc',
    '1'
  );
  t.is(
    t.context.runtime.syncEmbeddingState.callCount,
    callsBeforeMissingBackgroundDoc
  );

  t.context.runtime.cleanupExpiredRuntimeStates.onCall(0).resolves(1000);
  t.context.runtime.cleanupExpiredRuntimeStates.onCall(1).resolves(2);
  t.context.runtime.cleanupExpiredRuntimeGates.resolves(1);
  t.context.runtime.cleanupExpiredRollingQuota.resolves(1);
  t.context.runtime.cleanupUnreferencedArtifacts.resolves(1);

  await t.context.job.cleanExpiredRuntimeHousekeeping();

  t.is(t.context.runtime.cleanupExpiredRuntimeStates.callCount, 2);
  t.is(t.context.runtime.cleanupExpiredRuntimeGates.callCount, 1);
  t.is(t.context.runtime.cleanupExpiredRollingQuota.callCount, 1);
  t.is(t.context.runtime.cleanupUnreferencedArtifacts.callCount, 1);

  t.is(await t.context.searchJob.reconcileProjection(7), 0);
  t.false(t.context.runtime.reconcileSearchProjection.called);
  t.context.runtime.searchEnabled.returns(true);
  t.is(await t.context.searchJob.reconcileProjection(7), 2);
  t.true(t.context.runtime.reconcileSearchProjection.calledOnceWithExactly(7));

  const module = t.context.module;
  const db = module.get(PrismaClient);
  const nativeProvider = new BackendRuntimeProvider(
    module.get(ServerConfigHandle)
  );
  const workspaceId = `embedding-poison-${randomUUID()}`;
  await nativeProvider.start();
  try {
    await nativeProvider.runMigrations();
    await nativeProvider.activateWorkspaceLifecycleV1();
    await db.$executeRaw`INSERT INTO workspaces(id,enable_doc_embedding) VALUES(${workspaceId},true)`;
    await db.$executeRaw`INSERT INTO storage_reconciliation_checkpoints(kind,scope,status)
      VALUES('workspace_doc_lifecycle',${workspaceId},'completed')`;
    await db.$executeRaw`INSERT INTO snapshots(workspace_id,guid,blob,updated_at)
      SELECT ${workspaceId},'bad-'||lpad(i::text,3,'0'),decode('ff','hex'),to_timestamp(1)
      FROM generate_series(1,100) i`;
    await db.$executeRaw`INSERT INTO snapshots(workspace_id,guid,blob,updated_at)
      VALUES(${workspaceId},'healthy',${healthySnapshot.bin},to_timestamp(2))`;
    const service = new BackendRuntimeEmbeddingService(
      nativeProvider,
      module.get(Models)
    );
    const runner = new DocJobRunner(
      module.get(DatabaseDocReader),
      db,
      module.get(Models),
      nativeProvider,
      service,
      module.get(StorageRuntimeProvider),
      module.get(DocStorageOptions),
      module.get(EventBus)
    );
    await t.throwsAsync(
      () => nativeProvider.getCurrentWorkspaceDocV1(workspaceId, 'bad-001'),
      {
        instanceOf: DocUpdateInvalid,
      }
    );
    await t.throwsAsync(
      () => service.prepareSelectedDocuments(workspaceId, ['bad-001']),
      {
        instanceOf: CopilotSelectedSourcesFailed,
      }
    );
    const getCurrent =
      nativeProvider.getCurrentWorkspaceDocV1.bind(nativeProvider);
    const read = Sinon.stub(
      nativeProvider,
      'getCurrentWorkspaceDocV1'
    ).callsFake(async (workspace, docId) => {
      try {
        return await getCurrent(workspace, docId);
      } catch (error) {
        if (docId === 'bad-001') {
          await db.$executeRaw`UPDATE snapshots SET blob=${healthySnapshot.bin},updated_at=to_timestamp(2)
            WHERE workspace_id=${workspaceId} AND guid='bad-001'`;
        }
        throw error;
      }
    });
    try {
      t.deepEqual(await runner.syncEmbeddingDocuments(), {
        scannedDocuments: 100,
        syncedDocuments: 100,
      });
    } finally {
      read.restore();
    }
    const raced = await db.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) FROM embedding_sources
      WHERE workspace_id=${workspaceId} AND source_key='bad-001'`;
    t.is(raced[0].count, 0n);
    t.deepEqual(await runner.syncEmbeddingDocuments(), {
      scannedDocuments: 2,
      syncedDocuments: 2,
    });
    t.deepEqual(await runner.syncEmbeddingDocuments(), {
      scannedDocuments: 0,
      syncedDocuments: 0,
    });
    const sources = await db.$queryRaw<
      { source_key: string; content_revision: string; reason: string | null }[]
    >`
      SELECT source_key,content_revision,document_projection->>'skipReason' AS reason FROM embedding_sources
      WHERE workspace_id=${workspaceId} ORDER BY source_key`;
    t.is(sources.length, 101);
    t.is(
      sources.filter(source => source.reason === 'invalid_document').length,
      99
    );
    t.like(
      sources.find(source => source.source_key === 'bad-001'),
      { content_revision: '2000', reason: null }
    );
    t.like(
      sources.find(source => source.source_key === 'healthy'),
      { content_revision: '2000', reason: null }
    );
  } finally {
    await nativeProvider.stop();
    await db.$executeRaw`DELETE FROM embedding_sources WHERE workspace_id=${workspaceId}`;
    await db.$executeRaw`DELETE FROM embedding_workspace_states WHERE workspace_id=${workspaceId}`;
    await db.$executeRaw`DELETE FROM snapshots WHERE workspace_id=${workspaceId}`;
    await db.$executeRaw`DELETE FROM storage_reconciliation_checkpoints WHERE scope=${workspaceId}`;
    await db.$executeRaw`DELETE FROM search_projection.workspace_states WHERE workspace_id=${workspaceId}`;
    await db.$executeRaw`DELETE FROM workspaces WHERE id=${workspaceId}`;
  }
});
