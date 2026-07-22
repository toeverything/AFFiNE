import ava, { TestFn } from 'ava';
import Sinon from 'sinon';

import { StorageBlobJob } from '../blob-job';

interface Context {
  runtime: {
    health: Sinon.SinonStub;
    reconcileWorkspaceDocuments: Sinon.SinonStub;
    backfillMissingBlobMetadata: Sinon.SinonStub;
    rebuildWorkspaceDocBlobRefs: Sinon.SinonStub;
    planUnreferencedWorkspaceBlobs: Sinon.SinonStub;
    executeBlobCleanupCandidates: Sinon.SinonStub;
    executeDocumentCleanupCandidates: Sinon.SinonStub;
    ackDocumentCleanupEffect: Sinon.SinonStub;
  };
  event: {
    emitAsync: Sinon.SinonStub;
  };
  queue: {
    add: Sinon.SinonStub;
  };
  db: {
    $queryRaw: Sinon.SinonStub;
    workspace: {
      findMany: Sinon.SinonStub;
    };
  };
  job: StorageBlobJob;
}

const test = ava as TestFn<Context>;

test.beforeEach(t => {
  t.context.runtime = {
    health: Sinon.stub().resolves({
      databaseConnected: true,
      providerConfigured: true,
      provider: 'fs',
    }),
    reconcileWorkspaceDocuments: Sinon.stub().resolves({
      scannedDocs: 1,
      marked: 0,
      reset: 0,
      recovered: 0,
    }),
    backfillMissingBlobMetadata: Sinon.stub(),
    rebuildWorkspaceDocBlobRefs: Sinon.stub(),
    planUnreferencedWorkspaceBlobs: Sinon.stub(),
    executeBlobCleanupCandidates: Sinon.stub(),
    executeDocumentCleanupCandidates: Sinon.stub(),
    ackDocumentCleanupEffect: Sinon.stub(),
  };
  t.context.event = {
    emitAsync: Sinon.stub().resolves(undefined),
  };
  t.context.queue = {
    add: Sinon.stub().resolves(undefined),
  };
  t.context.db = {
    $queryRaw: Sinon.stub().resolves([
      {
        marked: 0n,
        failed: 0n,
        effectsPending: 0n,
        failedWorkspaceCheckpoints: 0n,
        rootFailureCheckpoints: 0n,
        staleProjectionBlocks: 0n,
        oldestFailedSeconds: null,
        oldestEffectsPendingSeconds: null,
      },
    ]),
    workspace: {
      findMany: Sinon.stub(),
    },
  };
  t.context.job = new StorageBlobJob(
    t.context.runtime as any,
    t.context.event as any,
    t.context.queue as any,
    t.context.db as any
  );
});

const objectStorageRequiredCases: {
  name: string;
  run: (context: Context) => Promise<unknown>;
  untouched: (context: Context) => Sinon.SinonStub[];
}[] = [
  {
    name: 'blob metadata backfill sweep',
    run: context => context.job.backfillMissingBlobMetadataBySid({}),
    untouched: context => [
      context.db.workspace.findMany,
      context.runtime.backfillMissingBlobMetadata,
      context.queue.add,
    ],
  },
  {
    name: 'blob cleanup execution',
    run: context =>
      context.job.executeBlobCleanupCandidates({ runId: 'run-1' }),
    untouched: context => [
      context.runtime.executeBlobCleanupCandidates,
      context.event.emitAsync,
    ],
  },
  {
    name: 'blob cleanup execution sweep',
    run: context => context.job.executeBlobCleanupCandidatesByMarkedRuns({}),
    untouched: context => [
      context.db.$queryRaw,
      context.runtime.executeBlobCleanupCandidates,
      context.event.emitAsync,
      context.queue.add,
    ],
  },
  {
    name: 'blob cleanup planning sweep',
    run: context => context.job.planUnreferencedWorkspaceBlobsBySid({}),
    untouched: context => [
      context.db.workspace.findMany,
      context.runtime.planUnreferencedWorkspaceBlobs,
      context.queue.add,
    ],
  },
  {
    name: 'blob cleanup planning',
    run: context =>
      context.job.planUnreferencedWorkspaceBlobs({
        workspaceId: 'workspace-1',
      }),
    untouched: context => [context.runtime.planUnreferencedWorkspaceBlobs],
  },
];

for (const scenario of objectStorageRequiredCases) {
  test(`${scenario.name} skips when object storage is not configured`, async t => {
    t.context.runtime.health.resolves({
      databaseConnected: true,
      providerConfigured: true,
      provider: undefined,
    });

    await scenario.run(t.context);

    t.true(t.context.runtime.health.calledOnce);
    for (const stub of scenario.untouched(t.context)) {
      t.false(stub.called);
    }
  });
}

test('blob cleanup planning drains each workspace cursor before continuing', async t => {
  t.context.db.workspace.findMany.resolves([
    { id: 'workspace-1', sid: 1 },
    { id: 'workspace-2', sid: 2 },
  ]);
  t.context.runtime.planUnreferencedWorkspaceBlobs
    .onFirstCall()
    .resolves({
      runId: 'run-1',
      scannedBlobs: 100,
      candidatesMarked: 100,
      nextCursor: 'cursor-1',
    })
    .onSecondCall()
    .resolves({
      runId: 'run-2',
      scannedBlobs: 50,
      candidatesMarked: 40,
      nextCursor: null,
    })
    .onThirdCall()
    .resolves({
      runId: 'run-3',
      scannedBlobs: 1,
      candidatesMarked: 0,
      nextCursor: null,
    });

  await t.context.job.planUnreferencedWorkspaceBlobsBySid({
    workspaceLimit: 2,
    gracePeriodDays: 14,
    limit: 100,
  });

  t.is(t.context.runtime.planUnreferencedWorkspaceBlobs.callCount, 3);
  t.deepEqual(t.context.runtime.planUnreferencedWorkspaceBlobs.firstCall.args, [
    'workspace-1',
    14,
    100,
  ]);
  t.deepEqual(
    t.context.runtime.planUnreferencedWorkspaceBlobs.secondCall.args,
    ['workspace-1', 14, 100]
  );
  t.deepEqual(t.context.runtime.planUnreferencedWorkspaceBlobs.thirdCall.args, [
    'workspace-2',
    14,
    100,
  ]);
  t.true(
    t.context.queue.add.calledWith(
      'backendRuntime.planUnreferencedWorkspaceBlobsBySid',
      { lastSid: 2, workspaceLimit: 2, gracePeriodDays: 14, limit: 100 }
    )
  );
});

test('daily blob cleanup execution uses a fixed job id', async t => {
  await t.context.job.dailyBlobCleanupExecution();

  t.true(
    t.context.queue.add.calledWith(
      'backendRuntime.executeDocumentCleanupCandidates',
      {},
      { jobId: 'daily-backend-runtime-document-cleanup-execution' }
    )
  );
  t.true(
    t.context.queue.add.calledWith(
      'backendRuntime.executeBlobCleanupCandidatesByMarkedRuns',
      {},
      { jobId: 'daily-backend-runtime-blob-cleanup-execution' }
    )
  );
});

test('daily storage reconciliation uses a fixed job id', async t => {
  await t.context.job.dailyStorageReconciliation();

  t.true(
    t.context.queue.add.calledWith(
      'backendRuntime.reconcileWorkspaceStorageBySid',
      {},
      { jobId: 'daily-backend-runtime-storage-reconciliation' }
    )
  );
});

test('storage reconciliation orders document retention before blob cleanup', async t => {
  t.context.db.workspace.findMany.resolves([{ id: 'workspace-1', sid: 1 }]);
  t.context.runtime.rebuildWorkspaceDocBlobRefs.resolves({
    scannedDocs: 1,
    parsedDocs: 1,
    refsWritten: 1,
    refsDeleted: 0,
    failedDocs: 0,
    nextCursor: null,
  });
  t.context.runtime.planUnreferencedWorkspaceBlobs.resolves({
    runId: 'run-1',
    scannedBlobs: 1,
    candidatesMarked: 0,
    nextCursor: null,
  });

  await t.context.job.reconcileWorkspaceStorageBySid({ workspaceLimit: 10 });

  Sinon.assert.callOrder(
    t.context.runtime.reconcileWorkspaceDocuments,
    t.context.runtime.rebuildWorkspaceDocBlobRefs,
    t.context.runtime.planUnreferencedWorkspaceBlobs
  );
  t.pass();
});

test('storage reconciliation still refreshes document retention without object storage', async t => {
  t.context.runtime.health.resolves({
    databaseConnected: true,
    providerConfigured: true,
    provider: undefined,
  });
  t.context.db.workspace.findMany.resolves([{ id: 'workspace-1', sid: 1 }]);
  t.context.runtime.rebuildWorkspaceDocBlobRefs.resolves({
    scannedDocs: 1,
    parsedDocs: 1,
    refsWritten: 0,
    refsDeleted: 0,
    failedDocs: 0,
    nextCursor: null,
  });

  await t.context.job.reconcileWorkspaceStorageBySid({});

  t.true(t.context.runtime.reconcileWorkspaceDocuments.calledOnce);
  t.true(t.context.runtime.rebuildWorkspaceDocBlobRefs.calledOnce);
  t.false(t.context.runtime.planUnreferencedWorkspaceBlobs.called);
});

test('document cleanup dispatches independent stable search and copilot effects', async t => {
  t.context.runtime.executeDocumentCleanupCandidates.resolves({
    scannedCandidates: 1,
    serializationRetries: 0,
    executed: 1,
    recovered: 0,
    reset: 0,
    failed: 0,
    deletedRows: 3,
    effects: [
      {
        workspaceId: 'workspace-1',
        docId: 'doc-1',
        cleanupVersion: 'version-1',
        commentObjectsDone: true,
        searchDone: false,
        copilotDone: false,
      },
    ],
  });

  await t.context.job.executeDocumentCleanupCandidates({});

  t.true(
    t.context.queue.add.calledWith(
      'indexer.reconcileDocumentCleanup',
      Sinon.match({ docId: 'doc-1' }),
      {
        jobId: 'document-cleanup:search:workspace-1:doc-1:version-1',
      }
    )
  );
  t.true(
    t.context.queue.add.calledWith(
      'copilot.embedding.reconcileDocumentCleanup',
      Sinon.match({ docId: 'doc-1' }),
      {
        jobId: 'document-cleanup:copilot:workspace-1:doc-1:version-1',
      }
    )
  );
  t.true(
    t.context.event.emitAsync.calledWith('workspace.blobs.updated', {
      workspaceId: 'workspace-1',
    })
  );
});

test('document cleanup effect ack delegates to storage runtime', async t => {
  await t.context.job.ackDocumentCleanupEffect({
    workspaceId: 'workspace-1',
    docId: 'doc-1',
    cleanupVersion: 'version-1',
    effect: 'search',
  });

  t.deepEqual(t.context.runtime.ackDocumentCleanupEffect.firstCall.args, [
    'workspace-1',
    'doc-1',
    'version-1',
    'search',
  ]);
});

test('blob cleanup execution sweep drains marked runs and continues by page', async t => {
  t.context.db.$queryRaw
    .onFirstCall()
    .resolves([{ runId: 'run-1' }, { runId: 'run-2' }])
    .onSecondCall()
    .resolves([{ exists: true }]);
  t.context.runtime.executeBlobCleanupCandidates
    .onFirstCall()
    .resolves({
      scannedCandidates: 100,
      deletedObjects: 100,
      deletedMetadata: 100,
      skippedStillReferenced: 0,
      failed: 0,
      workspaceIds: ['workspace-1'],
    })
    .onSecondCall()
    .resolves({
      scannedCandidates: 5,
      deletedObjects: 5,
      deletedMetadata: 5,
      skippedStillReferenced: 0,
      failed: 0,
      workspaceIds: ['workspace-1'],
    })
    .onThirdCall()
    .resolves({
      scannedCandidates: 1,
      deletedObjects: 0,
      deletedMetadata: 0,
      skippedStillReferenced: 0,
      failed: 1,
      workspaceIds: [],
    });

  await t.context.job.executeBlobCleanupCandidatesByMarkedRuns({
    runLimit: 2,
    gracePeriodDays: 14,
    candidateLimit: 100,
  });

  t.is(t.context.runtime.executeBlobCleanupCandidates.callCount, 3);
  t.deepEqual(t.context.runtime.executeBlobCleanupCandidates.firstCall.args, [
    'run-1',
    14,
    100,
  ]);
  t.deepEqual(t.context.runtime.executeBlobCleanupCandidates.secondCall.args, [
    'run-1',
    14,
    100,
  ]);
  t.deepEqual(t.context.runtime.executeBlobCleanupCandidates.thirdCall.args, [
    'run-2',
    14,
    100,
  ]);
  t.is(t.context.event.emitAsync.callCount, 2);
  t.true(
    t.context.queue.add.calledWith(
      'backendRuntime.executeBlobCleanupCandidatesByMarkedRuns',
      { runLimit: 2, gracePeriodDays: 14, candidateLimit: 100 }
    )
  );
});

test('blob cleanup execution sweep does not continue failed-only backlog', async t => {
  t.context.db.$queryRaw
    .onFirstCall()
    .resolves([{ runId: 'run-1' }])
    .onSecondCall()
    .resolves([{ exists: false }]);
  t.context.runtime.executeBlobCleanupCandidates.resolves({
    scannedCandidates: 100,
    deletedObjects: 0,
    deletedMetadata: 0,
    skippedStillReferenced: 0,
    failed: 100,
    workspaceIds: [],
  });

  await t.context.job.executeBlobCleanupCandidatesByMarkedRuns({
    runLimit: 1,
    candidateLimit: 100,
  });

  t.is(t.context.runtime.executeBlobCleanupCandidates.callCount, 1);
  t.false(t.context.queue.add.called);
});

test('blob cleanup execution sweep does not continue after drain errors', async t => {
  t.context.db.$queryRaw
    .onFirstCall()
    .resolves([{ runId: 'run-1' }])
    .onSecondCall()
    .resolves([{ exists: true }]);
  t.context.runtime.executeBlobCleanupCandidates.rejects(
    new Error('storage outage')
  );

  await t.context.job.executeBlobCleanupCandidatesByMarkedRuns({
    runLimit: 1,
  });

  t.is(t.context.runtime.executeBlobCleanupCandidates.callCount, 1);
  t.false(t.context.queue.add.called);
});
