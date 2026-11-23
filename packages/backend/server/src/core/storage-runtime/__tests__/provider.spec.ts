import { resolve } from 'node:path';

import test from 'ava';
import Sinon from 'sinon';

import { ServerConfigHandle } from '../../../native';
import { StorageRuntimeProvider } from '../provider';

function createProvider() {
  const provider = new StorageRuntimeProvider(
    new ServerConfigHandle(
      resolve(env.projectRoot, '../../../.docker/selfhost/config.json.example')
    )
  );
  const runtime = {
    start: Sinon.stub().resolves(),
    stop: Sinon.stub().resolves(),
    reloadConfig: Sinon.stub().resolves(),
    runMigrations: Sinon.stub().resolves(),
    health: Sinon.stub().resolves({
      started: true,
      databaseConnected: true,
      provider: 'fs',
    }),
  };
  (provider as any).runtime = runtime;
  return { provider, runtime };
}

test('storage-runtime provider reloads on storage config changes', async t => {
  const { provider, runtime } = createProvider();

  await provider.start();
  await provider.runMigrations();
  await provider.onConfigChanged({ updates: { storages: {} } });

  t.is(runtime.stop.callCount, 0);
  t.is(runtime.start.callCount, 1);
  t.is(runtime.reloadConfig.callCount, 1);
  t.is(runtime.runMigrations.callCount, 1);

  runtime.reloadConfig.rejects(new Error('sensitive storage credential'));
  await provider.onConfigChanged({ updates: { storages: {} } });
  t.is(runtime.stop.callCount, 0);
  t.is(runtime.start.callCount, 1);
});

test('storage-runtime provider reloads on copilot storage config changes', async t => {
  const { provider, runtime } = createProvider();

  await provider.start();
  await provider.runMigrations();
  await provider.onConfigChanged({
    updates: { copilot: { storage: undefined } },
  });

  t.is(runtime.stop.callCount, 0);
  t.is(runtime.start.callCount, 1);
  t.is(runtime.reloadConfig.callCount, 1);
  t.is(runtime.runMigrations.callCount, 1);
});

test('storage-runtime provider ignores unrelated config changes', async t => {
  const { provider, runtime } = createProvider();

  await provider.start();
  await provider.onConfigChanged({ updates: { flags: {} } });
  await provider.onConfigChanged({ updates: { db: {} } });

  t.is(runtime.stop.callCount, 0);
  t.is(runtime.start.callCount, 1);
  t.is(runtime.reloadConfig.callCount, 0);
  t.is(runtime.runMigrations.callCount, 0);
});
