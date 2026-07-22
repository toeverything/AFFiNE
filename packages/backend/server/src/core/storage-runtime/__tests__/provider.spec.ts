import test from 'ava';
import Sinon from 'sinon';

import { StorageRuntimeProvider } from '../provider';

function createProvider() {
  const provider = new StorageRuntimeProvider({
    db: {
      datasourceUrl: 'postgresql://localhost:5432/affine',
    },
    storages: {
      blob: {
        storage: {
          provider: 'fs',
          bucket: 'blobs',
          config: { path: '~/.affine/storage' },
        },
      },
      avatar: {
        storage: {
          provider: 'fs',
          bucket: 'avatars',
          config: { path: '~/.affine/storage' },
        },
      },
    },
    copilot: {
      storage: {
        provider: 'fs',
        bucket: 'copilot',
        config: { path: '~/.affine/storage' },
      },
    },
  } as any);
  const runtime = {
    configure: Sinon.stub(),
    start: Sinon.stub().resolves(),
    stop: Sinon.stub().resolves(),
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

test('storage-runtime provider restarts on storage config changes', async t => {
  const { provider, runtime } = createProvider();

  await provider.start();
  await provider.onConfigChanged({ updates: { storages: {} } });

  t.is(runtime.stop.callCount, 1);
  t.is(runtime.configure.callCount, 2);
  t.is(runtime.start.callCount, 2);
  t.is(runtime.runMigrations.callCount, 2);
});

test('storage-runtime provider restarts on copilot storage config changes', async t => {
  const { provider, runtime } = createProvider();

  await provider.start();
  await provider.onConfigChanged({
    updates: {
      copilot: {
        storage: {
          provider: 'fs',
          bucket: 'new-copilot',
          config: { path: '~/.affine/storage' },
        },
      },
    },
  });

  t.is(runtime.stop.callCount, 1);
  t.is(runtime.configure.callCount, 2);
  t.is(runtime.start.callCount, 2);
  t.is(runtime.runMigrations.callCount, 2);
});

test('storage-runtime provider ignores unrelated config changes', async t => {
  const { provider, runtime } = createProvider();

  await provider.start();
  await provider.onConfigChanged({ updates: { flags: {} } });

  t.is(runtime.stop.callCount, 0);
  t.is(runtime.start.callCount, 1);
  t.is(runtime.runMigrations.callCount, 1);
});
