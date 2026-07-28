import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';

import test from 'ava';
import Sinon from 'sinon';

import { createModule } from '../../../__tests__/create-module';
import { Mockers } from '../../../__tests__/mocks';
import { Config, JOB_SIGNAL } from '../../../base';
import { ConfigModule } from '../../../base/config';
import { ServerConfigModule } from '../../../core/config';
import { DocReader } from '../../../core/doc';
import { Models } from '../../../models';
import { addDocToRootDoc } from '../../../native';
import { SearchProviderFactory } from '../factory';
import { IndexerModule, IndexerService } from '../index';
import { IndexerJob } from '../job';
import { ManticoresearchProvider } from '../providers';
import { blockSQL, docSQL, SearchTable } from '../tables';

const module = await createModule({
  imports: [
    IndexerModule,
    ServerConfigModule,
    ConfigModule.override({
      indexer: {
        enabled: true,
      },
    }),
  ],
  providers: [IndexerService],
});
const indexerService = module.get(IndexerService);
const indexerJob = module.get(IndexerJob);
const searchProviderFactory = module.get(SearchProviderFactory);
const manticoresearch = module.get(ManticoresearchProvider);
const models = module.get(Models);
const docReader = module.get(DocReader);
const config = module.get(Config);

const user = await module.create(Mockers.User);
const workspace = await module.create(Mockers.Workspace, {
  snapshot: true,
  owner: user,
});

test.before(async () => {
  await manticoresearch.recreateTable(SearchTable.block, blockSQL);
  await manticoresearch.recreateTable(SearchTable.doc, docSQL);
});

test.after.always(async () => {
  await module.close();
});

test.afterEach.always(() => {
  Sinon.restore();
  mock.reset();
});

test.beforeEach(() => {
  mock.method(searchProviderFactory, 'get', () => {
    return manticoresearch;
  });
});

test('should handle indexer.indexDoc job', async t => {
  const spy = Sinon.spy(indexerService, 'indexDoc');
  await indexerJob.indexDoc({
    workspaceId: workspace.id,
    docId: randomUUID(),
  });
  t.is(spy.callCount, 1);
});

test('should handle indexer.deleteDoc job', async t => {
  const spy = Sinon.spy(indexerService, 'deleteDoc');
  await indexerJob.deleteDoc({
    workspaceId: workspace.id,
    docId: randomUUID(),
  });
  t.is(spy.callCount, 1);
});

test('should handle indexer.indexWorkspace job', async t => {
  const count = module.queue.count('indexer.deleteDoc');
  const spy = Sinon.spy(indexerService, 'listDocIds');

  await indexerJob.indexWorkspace({
    workspaceId: workspace.id,
  });

  t.is(spy.callCount, 1);
  const { payload } = await module.queue.waitFor('indexer.indexDoc');
  t.is(payload.workspaceId, workspace.id);
  t.is(payload.docId, '5nS9BSp3Px');
  // no delete job
  t.is(module.queue.count('indexer.deleteDoc'), count);

  // workspace should be indexed
  const ws = await models.workspace.get(workspace.id);
  t.is(ws!.indexed, true);
});

test('should not sync existing doc', async t => {
  const count = module.queue.count('indexer.indexDoc');
  mock.method(indexerService, 'listDocIds', async () => {
    return ['5nS9BSp3Px'];
  });

  await indexerJob.indexWorkspace({
    workspaceId: workspace.id,
  });

  t.is(module.queue.count('indexer.indexDoc'), count);
});

test('should delete dangling indexed docs absent from the root live set', async t => {
  const count = module.queue.count('indexer.deleteDoc');
  mock.method(indexerService, 'listDocIds', async () => {
    return ['mock-doc-id1', 'mock-doc-id2'];
  });

  await indexerJob.indexWorkspace({
    workspaceId: workspace.id,
  });

  const { payload } = await module.queue.waitFor('indexer.indexDoc');
  t.is(payload.workspaceId, workspace.id);
  t.is(payload.docId, '5nS9BSp3Px');
  t.is(module.queue.count('indexer.deleteDoc'), count + 2);
});

test('document cleanup reconcile deletes missing search state before ack', async t => {
  const deleteSpy = Sinon.spy(indexerService, 'deleteDoc');
  const indexSpy = Sinon.spy(indexerService, 'indexDoc');
  const cleanupWorkspace = await module.create(Mockers.Workspace, {
    owner: user,
  });
  await module.create(Mockers.DocSnapshot, {
    workspaceId: cleanupWorkspace.id,
    docId: cleanupWorkspace.id,
    user,
    blob: addDocToRootDoc(Buffer.from([0, 0]), 'live-doc', 'Live'),
  });

  await indexerJob.reconcileDocumentCleanup({
    workspaceId: cleanupWorkspace.id,
    docId: 'missing-doc',
    cleanupVersion: 'version-1',
  });

  t.true(deleteSpy.calledOnceWith(cleanupWorkspace.id, 'missing-doc'));
  t.false(indexSpy.called);
  const { payload } = await module.queue.waitFor(
    'backendRuntime.ackDocumentCleanupEffect'
  );
  t.deepEqual(payload, {
    workspaceId: cleanupWorkspace.id,
    docId: 'missing-doc',
    cleanupVersion: 'version-1',
    effect: 'search',
  });
});

test('document cleanup reconcile reindexes restored doc before ack', async t => {
  const deleteSpy = Sinon.spy(indexerService, 'deleteDoc');
  const indexSpy = Sinon.spy(indexerService, 'indexDoc');
  const cleanupWorkspace = await module.create(Mockers.Workspace, {
    owner: user,
  });
  await module.create(Mockers.DocSnapshot, {
    workspaceId: cleanupWorkspace.id,
    docId: cleanupWorkspace.id,
    user,
    blob: addDocToRootDoc(Buffer.from([0, 0]), 'restored-doc', 'Restored'),
  });
  await module.create(Mockers.DocSnapshot, {
    workspaceId: cleanupWorkspace.id,
    docId: 'restored-doc',
    user,
  });
  const getDocSpy = Sinon.spy(docReader, 'getDoc');

  await indexerJob.reconcileDocumentCleanup({
    workspaceId: cleanupWorkspace.id,
    docId: 'restored-doc',
    cleanupVersion: 'version-2',
  });

  t.true(indexSpy.calledOnceWith(cleanupWorkspace.id, 'restored-doc'));
  t.false(deleteSpy.called);
  t.true(getDocSpy.calledWith(cleanupWorkspace.id, cleanupWorkspace.id));
  t.true(getDocSpy.calledWith(cleanupWorkspace.id, 'restored-doc'));
  const { payload } = await module.queue.waitFor(
    'backendRuntime.ackDocumentCleanupEffect'
  );
  t.deepEqual(payload, {
    workspaceId: cleanupWorkspace.id,
    docId: 'restored-doc',
    cleanupVersion: 'version-2',
    effect: 'search',
  });
});

test('document cleanup reconcile only acknowledges when indexer is disabled', async t => {
  Sinon.stub(config.indexer, 'enabled').value(false);
  const deleteSpy = Sinon.spy(indexerService, 'deleteDoc');
  const indexSpy = Sinon.spy(indexerService, 'indexDoc');
  const getDocSpy = Sinon.spy(docReader, 'getDoc');

  await indexerJob.reconcileDocumentCleanup({
    workspaceId: workspace.id,
    docId: 'disabled-doc',
    cleanupVersion: 'version-disabled',
  });

  t.false(deleteSpy.called);
  t.false(indexSpy.called);
  t.false(getDocSpy.called);
  const { payload } = await module.queue.waitFor(
    'backendRuntime.ackDocumentCleanupEffect'
  );
  t.deepEqual(payload, {
    workspaceId: workspace.id,
    docId: 'disabled-doc',
    cleanupVersion: 'version-disabled',
    effect: 'search',
  });
});

test('should handle indexer.deleteWorkspace job', async t => {
  const spy = Sinon.spy(indexerService, 'deleteWorkspace');

  await indexerJob.deleteWorkspace({
    workspaceId: workspace.id,
  });

  t.is(spy.callCount, 1);
});

test('should handle indexer.autoIndexWorkspaces job', async t => {
  const workspace = await module.create(Mockers.Workspace, {
    snapshot: true,
  });

  const result = await indexerJob.autoIndexWorkspaces({
    lastIndexedWorkspaceSid: workspace.sid - 1,
  });
  t.is(result, JOB_SIGNAL.Repeat);

  const { payload } = await module.queue.waitFor('indexer.indexWorkspace');
  t.is(payload.workspaceId, workspace.id);

  // no new auto index job
  const count = module.queue.count('indexer.autoIndexWorkspaces');

  await indexerJob.autoIndexWorkspaces({
    lastIndexedWorkspaceSid: workspace.sid,
  });

  t.is(module.queue.count('indexer.autoIndexWorkspaces'), count);
});

test('should not index workspace if it is not updated in 180 days', async t => {
  const workspace = await module.create(Mockers.Workspace);
  await module.create(Mockers.DocSnapshot, {
    user,
    workspaceId: workspace.id,
    docId: workspace.id,
    updatedAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000 - 1),
  });

  const count = module.queue.count('indexer.indexWorkspace');

  await indexerJob.autoIndexWorkspaces({
    lastIndexedWorkspaceSid: workspace.sid - 1,
  });

  t.is(module.queue.count('indexer.indexWorkspace'), count);
});

test('should not index workspace if snapshot not exists', async t => {
  // not create snapshot
  const workspace = await module.create(Mockers.Workspace);

  const count = module.queue.count('indexer.indexWorkspace');

  await indexerJob.autoIndexWorkspaces({
    lastIndexedWorkspaceSid: workspace.sid - 1,
  });

  t.is(module.queue.count('indexer.indexWorkspace'), count);
});
