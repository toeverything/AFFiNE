import { NbstoreProvider } from '@affine/core/modules/storage';
import { apis } from '@affine/electron-api';
import { StoreManagerClient } from '@affine/nbstore/worker/client';
import { setTelemetryTransport } from '@affine/track';
import type { Framework } from '@toeverything/infra';
import { OpClient } from '@toeverything/infra/op';
import { v4 as uuid } from 'uuid';

function createStoreManagerClient() {
  const { port1: portForOpClient, port2: portForWorker } = new MessageChannel();
  let portFromWorker: MessagePort | null = null;
  let portId = uuid();

  const handleMessage = (ev: MessageEvent) => {
    if (
      ev.data.type === 'electron:worker-connect' &&
      ev.data.portId === portId
    ) {
      portFromWorker = ev.ports[0];
      // connect portForWorker and portFromWorker
      portFromWorker.addEventListener('message', ev => {
        portForWorker.postMessage(ev.data, [...ev.ports]);
      });
      portForWorker.addEventListener('message', ev => {
        // oxlint-disable-next-line no-non-null-assertion
        portFromWorker!.postMessage(ev.data, [...ev.ports]);
      });
      portForWorker.start();
      portFromWorker.start();
    }
  };

  window.addEventListener('message', handleMessage);

  // oxlint-disable-next-line no-non-null-assertion
  apis!.worker.connectWorker('affine-shared-worker', portId).catch(err => {
    console.error('failed to connect worker', err);
  });

  const storeManager = new StoreManagerClient(new OpClient(portForOpClient));
  portForOpClient.start();
  return storeManager;
}

export function setupStoreManager(framework: Framework) {
  const storeManagerClient = createStoreManagerClient();
  setTelemetryTransport(storeManagerClient.telemetry);
  window.addEventListener('beforeunload', () => {
    storeManagerClient.dispose();
  });
  window.addEventListener('focus', () => {
    storeManagerClient.resume();
  });
  window.addEventListener('click', () => {
    storeManagerClient.resume();
  });
  window.addEventListener('blur', () => {
    storeManagerClient.pause();
  });

  framework.impl(NbstoreProvider, {
    openStore(key, options) {
      try {
        // E2E/debug only: capture init options passed to the nbstore worker.
        (globalThis as any).__e2eNbstoreOpenStoreLogs =
          (globalThis as any).__e2eNbstoreOpenStoreLogs ?? [];
        (globalThis as any).__e2eNbstoreOpenStoreLogs.push({
          key,
          remotes: Object.keys(options?.remotes ?? {}),
          diskSyncFolder:
            (options as any)?.remotes?.['disk']?.doc?.opts?.syncFolder ?? null,
        });
      } catch {
        // ignore
      }

      const { store, dispose } = storeManagerClient.open(key, options);

      return {
        store,
        dispose: () => {
          dispose();
        },
      };
    },
  });
}
