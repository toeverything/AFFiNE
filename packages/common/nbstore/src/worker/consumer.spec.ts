import 'fake-indexeddb/auto';

import { OpClient, OpConsumer, transfer } from '@toeverything/infra/op';
import { afterEach, expect, test, vi } from 'vitest';

import { Sync } from '../sync';
import { StoreManagerConsumer, type WorkerManagerOps } from './consumer';
import type { StoreInitOptions } from './ops';

afterEach(() => {
  vi.restoreAllMocks();
});

test('failed remote reconfigure leaves the existing sync running', async () => {
  const managerChannel = new MessageChannel();
  const managerConsumer = new OpConsumer<WorkerManagerOps>(
    managerChannel.port1
  );
  const managerClient = new OpClient<WorkerManagerOps>(managerChannel.port2);
  const manager = new StoreManagerConsumer([]);
  manager.bindConsumer(managerConsumer);

  const stop = vi.spyOn(Sync.prototype, 'stop');
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const firstStoreChannel = new MessageChannel();
  const secondStoreChannel = new MessageChannel();
  const initialOptions: StoreInitOptions = { local: {}, remotes: {} };
  const invalidOptions = {
    local: {},
    remotes: {
      missing: {
        doc: { name: 'missing-storage', opts: {} },
      },
    },
  } as unknown as StoreInitOptions;

  try {
    await managerClient.call(
      'open',
      transfer(
        {
          port: firstStoreChannel.port1,
          key: 'workspace',
          closeKey: 'first',
          options: initialOptions,
        },
        [firstStoreChannel.port1]
      )
    );
    await managerClient.call(
      'open',
      transfer(
        {
          port: secondStoreChannel.port1,
          key: 'workspace',
          closeKey: 'second',
          options: invalidOptions,
        },
        [secondStoreChannel.port1]
      )
    );

    await vi.waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'failed to reconfigure store',
        'workspace',
        expect.any(Error)
      );
    });
    expect(stop).not.toHaveBeenCalled();
  } finally {
    await managerClient.call('close', 'second').catch(() => {});
    await managerClient.call('close', 'first').catch(() => {});
    firstStoreChannel.port2.close();
    secondStoreChannel.port2.close();
    managerChannel.port1.close();
    managerChannel.port2.close();
  }
});
