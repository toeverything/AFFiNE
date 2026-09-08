import type { PrismaClient } from '@prisma/client';
import ava, { TestFn } from 'ava';
import Sinon from 'sinon';

import { EventBus } from '../../../base';
import { StorageRuntimeProvider } from '../../storage-runtime';
import { StorageBlobJob } from '../blob-job';

interface Context {
  runtime: Record<string, Sinon.SinonStub>;
  event: { emitAsync: Sinon.SinonStub };
  db: {
    $queryRaw: Sinon.SinonStub;
    $executeRaw: Sinon.SinonStub;
    workspace: { findMany: Sinon.SinonStub };
  };
  job: StorageBlobJob;
}

const test = ava as TestFn<Context>;

test.beforeEach(t => {
  t.context.runtime = {
    health: Sinon.stub().resolves({ provider: 'fs' }),
    reconcileWorkspaceStorage: Sinon.stub().resolves({
      deletedObjects: 0,
      deletedOrphanRows: 0,
      unknownPrefixes: 0,
      failedShards: 0,
      failedScopes: [],
      unknownPrefixSamples: [],
    }),
    reconcileWorkspaceDocuments: Sinon.stub().resolves({}),
    backfillMissingBlobMetadata: Sinon.stub().resolves({
      workspaceIds: [],
      upsertedMetadata: 0,
      scannedObjects: 0,
      failed: 0,
    }),
    rebuildDocBlobRefs: Sinon.stub().resolves({}),
    rebuildWorkspaceDocBlobRefs: Sinon.stub().resolves({
      parsedDocs: 0,
      failedDocs: 0,
    }),
    cleanupUnreferencedWorkspaceBlobs: Sinon.stub().resolves({
      workspaceIds: [],
      scannedBlobs: 0,
      deletedObjects: 0,
      protectedByDocRefs: 0,
      protectedByMetadata: 0,
      protectedByOtherRefs: 0,
      failed: 0,
    }),
    executeDocumentCleanupCandidates: Sinon.stub().resolves({
      serializationRetries: 0,
      failed: 0,
      effects: [],
    }),
  };
  t.context.event = { emitAsync: Sinon.stub().resolves(undefined) };
  t.context.db = {
    $queryRaw: Sinon.stub().resolves([]),
    $executeRaw: Sinon.stub().resolves(1),
    workspace: { findMany: Sinon.stub().resolves([]) },
  };
  t.context.job = new StorageBlobJob(
    t.context.runtime as unknown as StorageRuntimeProvider,
    t.context.event as unknown as EventBus,
    t.context.db as unknown as PrismaClient
  );
});

test('workspace sweep advances past failed workspaces and wraps for retry', async t => {
  t.context.db.workspace.findMany.resolves([
    { id: 'workspace-1', sid: 1 },
    { id: 'workspace-2', sid: 2 },
  ]);
  t.context.runtime.reconcileWorkspaceDocuments
    .onFirstCall()
    .rejects(new Error('broken workspace'));

  const result = await t.context.job.reconcileWorkspaceBatch();

  t.deepEqual(result, { scanned: 2, failures: 1, completed: false });
  t.is(t.context.runtime.reconcileWorkspaceDocuments.callCount, 2);
  t.true(t.context.runtime.cleanupUnreferencedWorkspaceBlobs.calledOnce);
  t.true(t.context.db.$executeRaw.calledOnce);
  t.deepEqual(JSON.parse(t.context.db.$executeRaw.lastCall.args[3]), {
    lastSid: 0,
    failures: 0,
  });

  t.context.db.$queryRaw.resolves([
    { status: 'running', lastSid: 25, failures: 1 },
  ]);
  t.context.db.workspace.findMany.resolves([]);
  t.deepEqual(await t.context.job.reconcileWorkspaceBatch(), {
    scanned: 0,
    failures: 0,
    completed: false,
  });
  t.deepEqual(JSON.parse(t.context.db.$executeRaw.lastCall.args[3]), {
    lastSid: 0,
    failures: 0,
  });
});

test('completed sweep restarts from the beginning for anti-entropy', async t => {
  t.context.db.$queryRaw.resolves([{ status: 'completed', lastSid: 91 }]);

  await t.context.job.reconcileWorkspaceBatch();

  t.deepEqual(t.context.db.workspace.findMany.firstCall.args[0].where, {
    sid: { gt: 0 },
  });
});

test('metadata sweep skips provider work when object storage is unavailable', async t => {
  t.context.runtime.health.resolves({ provider: undefined });

  await t.context.job.backfillBlobMetadata();

  t.false(t.context.db.workspace.findMany.called);
  t.false(t.context.runtime.backfillMissingBlobMetadata.called);
});

test('document cleanup records execution health without payload effects', async t => {
  t.context.runtime.executeDocumentCleanupCandidates.resolves({
    serializationRetries: 0,
    failed: 0,
  });
  t.context.db.$queryRaw.resolves([
    {
      marked: 0n,
      failed: 0n,
      failedWorkspaceCheckpoints: 0n,
      oldestFailedSeconds: null,
    },
  ]);

  await t.context.job.executeDocumentCleanup();

  t.false(t.context.event.emitAsync.called);
});
