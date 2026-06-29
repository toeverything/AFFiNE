import ava, { TestFn } from 'ava';
import Sinon from 'sinon';

import { BackendRuntimeBlobJob } from '../blob-job';

interface Context {
  runtime: {
    health: Sinon.SinonStub;
    backfillMissingBlobMetadata: Sinon.SinonStub;
    rebuildWorkspaceDocBlobRefs: Sinon.SinonStub;
    planUnreferencedWorkspaceBlobs: Sinon.SinonStub;
    executeBlobCleanupCandidates: Sinon.SinonStub;
  };
  event: {
    emitAsync: Sinon.SinonStub;
  };
  queue: {
    add: Sinon.SinonStub;
  };
  db: {
    workspace: {
      findMany: Sinon.SinonStub;
    };
  };
  job: BackendRuntimeBlobJob;
}

const test = ava as TestFn<Context>;

test.beforeEach(t => {
  t.context.runtime = {
    health: Sinon.stub().resolves({
      databaseConnected: true,
      objectStorageConfigured: true,
    }),
    backfillMissingBlobMetadata: Sinon.stub(),
    rebuildWorkspaceDocBlobRefs: Sinon.stub(),
    planUnreferencedWorkspaceBlobs: Sinon.stub(),
    executeBlobCleanupCandidates: Sinon.stub(),
  };
  t.context.event = {
    emitAsync: Sinon.stub().resolves(undefined),
  };
  t.context.queue = {
    add: Sinon.stub().resolves(undefined),
  };
  t.context.db = {
    workspace: {
      findMany: Sinon.stub(),
    },
  };
  t.context.job = new BackendRuntimeBlobJob(
    t.context.runtime as any,
    t.context.event as any,
    t.context.queue as any,
    t.context.db as any
  );
});

test('blob metadata backfill sweep skips when object storage is not configured', async t => {
  t.context.runtime.health.resolves({
    databaseConnected: true,
    objectStorageConfigured: false,
  });

  await t.context.job.backfillMissingBlobMetadataBySid({});

  t.true(t.context.runtime.health.calledOnce);
  t.false(t.context.db.workspace.findMany.called);
  t.false(t.context.runtime.backfillMissingBlobMetadata.called);
  t.false(t.context.queue.add.called);
});

test('blob cleanup execution skips when object storage is not configured', async t => {
  t.context.runtime.health.resolves({
    databaseConnected: true,
    objectStorageConfigured: false,
  });

  await t.context.job.executeBlobCleanupCandidates({ runId: 'run-1' });

  t.true(t.context.runtime.health.calledOnce);
  t.false(t.context.runtime.executeBlobCleanupCandidates.called);
  t.false(t.context.event.emitAsync.called);
});

test('doc blob refs sweep continues after one workspace fails', async t => {
  t.context.db.workspace.findMany.resolves([
    { id: 'workspace-1', sid: 1 },
    { id: 'workspace-2', sid: 2 },
  ]);
  t.context.runtime.rebuildWorkspaceDocBlobRefs
    .onFirstCall()
    .rejects(new Error('bad root doc'))
    .onSecondCall()
    .resolves({
      scannedDocs: 1,
      parsedDocs: 1,
      refsWritten: 0,
      refsDeleted: 0,
      failedDocs: 0,
      nextCursor: null,
    });

  await t.context.job.rebuildWorkspaceDocBlobRefsBySid({
    workspaceLimit: 2,
    docLimit: 100,
  });

  t.is(t.context.runtime.rebuildWorkspaceDocBlobRefs.callCount, 2);
  t.deepEqual(t.context.runtime.rebuildWorkspaceDocBlobRefs.firstCall.args, [
    'workspace-1',
    100,
  ]);
  t.deepEqual(t.context.runtime.rebuildWorkspaceDocBlobRefs.secondCall.args, [
    'workspace-2',
    100,
  ]);
  t.true(
    t.context.queue.add.calledWith(
      'backendRuntime.rebuildWorkspaceDocBlobRefsBySid',
      { lastSid: 2, workspaceLimit: 2, docLimit: 100 }
    )
  );
});

