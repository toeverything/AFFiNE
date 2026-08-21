import test from 'ava';

import { createModule } from '../../../__tests__/create-module';
import { JobQueue } from '../../../base';
import { ConfigModule } from '../../../base/config';
import { IndexerEvent } from '../event';
import { IndexerModule } from '../index';
import { IndexerScheduler } from '../scheduler';

const module = await createModule({
  imports: [
    IndexerModule,
    ConfigModule.override({
      indexer: {
        enabled: true,
      },
    }),
  ],
});
const indexerEvent = module.get(IndexerEvent);
const indexerScheduler = new IndexerScheduler(module.get(JobQueue));

test.after.always(async () => {
  await module.close();
});

test('should index workspace when root snapshot is updated', async t => {
  // @ts-expect-error ignore missing fields
  await indexerEvent.indexWorkspace({
    workspaceId: 'test-workspace',
    docId: 'test-workspace',
  });

  const { payload } = await module.queue.waitFor('indexer.indexWorkspace');
  t.is(payload.workspaceId, 'test-workspace');
});

test('should not index workspace when non-root snapshot is updated', async t => {
  const count = module.queue.count('indexer.indexWorkspace');

  // @ts-expect-error ignore missing fields
  await indexerEvent.indexWorkspace({
    workspaceId: 'test-workspace',
    docId: 'child-doc',
  });

  t.is(module.queue.count('indexer.indexWorkspace'), count);
});

test('should reindex documents after document access changes', async t => {
  await indexerEvent.reindexDocOnGrantChange({
    workspaceId: 'test-workspace',
    docId: 'test-doc',
  });
  const { payload } = await module.queue.waitFor('indexer.indexDoc');
  t.deepEqual(payload, {
    workspaceId: 'test-workspace',
    docId: 'test-doc',
  });
});

test('should delete workspace', async t => {
  // @ts-expect-error ignore missing fields
  await indexerEvent.deleteUserWorkspaces({
    ownedWorkspaces: ['test-workspace'],
  });

  const { payload } = await module.queue.waitFor('indexer.deleteWorkspace');
  t.is(payload.workspaceId, 'test-workspace');
});

test('should schedule auto index workspaces', async t => {
  await indexerScheduler.autoIndexWorkspaces();

  const { payload } = await module.queue.waitFor('indexer.autoIndexWorkspaces');
  t.is(payload.lastIndexedWorkspaceSid, undefined);
});
