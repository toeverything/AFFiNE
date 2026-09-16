import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ScheduleModule } from '@nestjs/schedule';
import ava, { TestFn } from 'ava';
import Sinon from 'sinon';

import {
  createTestingModule,
  type TestingModule,
} from '../../../__tests__/utils';
import {
  CopilotSelectedSourcesFailed,
  CopilotSelectedSourcesLimitExceeded,
  CopilotSelectedSourcesProcessing,
  CopilotSelectedSourcesUnavailable,
} from '../../../base';
import { Models } from '../../../models';
import {
  BackendRuntimeModule,
  BackendRuntimeProvider,
  BackendRuntimeWorkerModule,
} from '../index';
import {
  BackendRuntimeEmbeddingService,
  BackendRuntimeHousekeepingJob,
} from '../job';

interface Context {
  module: TestingModule;
  embeddingService: BackendRuntimeEmbeddingService;
  job: BackendRuntimeHousekeepingJob;
  getSnapshot: Sinon.SinonStub;
  allowEmbedding: Sinon.SinonStub;
  runtime: {
    cleanupExpiredRuntimeStates: Sinon.SinonStub;
    cleanupExpiredRuntimeGates: Sinon.SinonStub;
    cleanupExpiredRollingQuota: Sinon.SinonStub;
    cleanupUnreferencedArtifacts: Sinon.SinonStub;
    embeddingHealth: Sinon.SinonStub;
    syncEmbeddingState: Sinon.SinonStub;
    executeAuthSessionCommandV1: Sinon.SinonStub;
  };
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const snapshot = readFileSync(
    join(process.cwd(), 'src/__tests__/__fixtures__/test-doc.snapshot.bin')
  );
  t.context.runtime = {
    cleanupExpiredRuntimeStates: Sinon.stub(),
    cleanupExpiredRuntimeGates: Sinon.stub(),
    cleanupExpiredRollingQuota: Sinon.stub(),
    cleanupUnreferencedArtifacts: Sinon.stub(),
    embeddingHealth: Sinon.stub().resolves({ enabled: true }),
    syncEmbeddingState: Sinon.stub(),
    executeAuthSessionCommandV1: Sinon.stub().resolves({}),
  };
  t.context.module = await createTestingModule({
    imports: [
      ScheduleModule.forRoot(),
      BackendRuntimeModule,
      BackendRuntimeWorkerModule,
    ],
    tapModule: builder => {
      builder
        .overrideProvider(BackendRuntimeProvider)
        .useValue(t.context.runtime);
    },
  });
  const models = t.context.module.get(Models);
  t.context.getSnapshot = Sinon.stub(models.doc, 'getSnapshot').resolves({
    workspaceId: 'workspace-1',
    id: 'doc-1',
    blob: snapshot,
    size: BigInt(snapshot.length),
    state: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    createdBy: null,
    updatedBy: null,
    createdByUser: null,
    updatedByUser: null,
  });
  t.context.allowEmbedding = Sinon.stub(
    models.workspace,
    'allowEmbedding'
  ).resolves(true);
  t.context.embeddingService = t.context.module.get(
    BackendRuntimeEmbeddingService
  );
  t.context.job = t.context.module.get(BackendRuntimeHousekeepingJob);
});

test.beforeEach(t => {
  t.context.runtime.cleanupExpiredRuntimeStates.reset();
  t.context.runtime.cleanupExpiredRuntimeGates.reset();
  t.context.runtime.cleanupExpiredRollingQuota.reset();
  t.context.runtime.cleanupUnreferencedArtifacts.reset();
  t.context.runtime.embeddingHealth.resetHistory();
  t.context.runtime.syncEmbeddingState.reset();
  t.context.getSnapshot.resetHistory();
  t.context.allowEmbedding.resetHistory();
});

test.after.always(async t => {
  Sinon.restore();
  await t.context.module?.close();
});

test('backend-runtime jobs ingest documents and clean runtime state', async t => {
  await t.context.embeddingService.syncDocument('workspace-1', 'doc-1');
  t.is(t.context.getSnapshot.callCount, 1);
  t.is(t.context.runtime.syncEmbeddingState.callCount, 1);
  t.like(t.context.runtime.syncEmbeddingState.firstCall.args[0], {
    workspaceId: 'workspace-1',
    enabled: true,
    reconcileDocuments: true,
  });
  t.is(
    t.context.runtime.syncEmbeddingState.firstCall.args[0].documents[0].docId,
    'doc-1'
  );
  t.true(
    t.context.runtime.syncEmbeddingState.firstCall.args[0].documents[0].units
      .length > 0
  );

  await t.context.embeddingService.reconcileDocuments('workspace-1');
  t.like(t.context.runtime.syncEmbeddingState.secondCall.args[0], {
    workspaceId: 'workspace-1',
    enabled: true,
    reconcileDocuments: true,
  });

  await t.context.embeddingService.prepareSelectedDocuments('workspace-1', [
    'doc-1',
    'doc-1',
  ]);
  t.like(t.context.runtime.syncEmbeddingState.thirdCall.args[0], {
    workspaceId: 'workspace-1',
    enabled: true,
    reconcileDocuments: false,
    priority: 1000,
    waitForReadyMs: 90_000,
  });
  t.is(
    t.context.runtime.syncEmbeddingState.thirdCall.args[0].documents.length,
    1
  );

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
  t.context.getSnapshot.resolves(null);
  await t.throwsAsync(
    () =>
      t.context.embeddingService.prepareSelectedDocuments('workspace-1', [
        'missing-doc',
      ]),
    { instanceOf: CopilotSelectedSourcesUnavailable }
  );
  const callsBeforeMissingBackgroundDoc =
    t.context.runtime.syncEmbeddingState.callCount;
  await t.context.embeddingService.syncDocument('workspace-1', 'missing-doc');
  t.is(
    t.context.runtime.syncEmbeddingState.callCount,
    callsBeforeMissingBackgroundDoc + 1
  );
  t.deepEqual(
    t.context.runtime.syncEmbeddingState.lastCall.args[0].documents,
    []
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
});
