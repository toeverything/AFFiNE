import test from 'ava';
import Sinon from 'sinon';

import { createModule } from '../../../__tests__/create-module';
import { Config } from '../../../base';
import { ConfigModule } from '../../../base/config';
import { IndexerModule } from '..';
import { IndexerEvent } from '../event';

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
const config = module.get(Config);

test.after.always(async () => {
  await module.close();
});

test.afterEach.always(() => {
  Sinon.restore();
});

test('should not index workspace if indexer is disabled', async t => {
  Sinon.stub(config.indexer, 'enabled').value(false);
  const count = module.queue.count('indexer.indexWorkspace');

  // @ts-expect-error ignore missing fields
  await indexerEvent.indexWorkspace({ id: 'test-workspace' });

  t.is(module.queue.count('indexer.indexWorkspace'), count);
});

test('should index workspace if indexer is enabled', async t => {
  // @ts-expect-error ignore missing fields
  await indexerEvent.indexWorkspace({ id: 'test-workspace' });

  const { payload } = await module.queue.waitFor('indexer.indexWorkspace');
  t.is(payload.workspaceId, 'test-workspace');
});

test('should not delete workspace if indexer is disabled', async t => {
  Sinon.stub(config.indexer, 'enabled').value(false);
  const count = module.queue.count('indexer.deleteWorkspace');

  // @ts-expect-error ignore missing fields
  await indexerEvent.deleteUserWorkspaces({
    ownedWorkspaces: ['test-workspace'],
  });

  t.is(module.queue.count('indexer.deleteWorkspace'), count);
});

test('should delete workspace if indexer is enabled', async t => {
  // @ts-expect-error ignore missing fields
  await indexerEvent.deleteUserWorkspaces({
    ownedWorkspaces: ['test-workspace'],
  });

  const { payload } = await module.queue.waitFor('indexer.deleteWorkspace');
  t.is(payload.workspaceId, 'test-workspace');
});

test('should not schedule auto index workspaces if indexer is disabled', async t => {
  Sinon.stub(config.indexer, 'enabled').value(false);
  const count = module.queue.count('indexer.autoIndexWorkspaces');

  await indexerEvent.autoIndexWorkspaces();

  t.is(module.queue.count('indexer.autoIndexWorkspaces'), count);
});

test('should schedule auto index workspaces', async t => {
  await indexerEvent.autoIndexWorkspaces();

  const { payload } = await module.queue.waitFor('indexer.autoIndexWorkspaces');
  t.is(payload.lastIndexedWorkspaceSid, undefined);
});
