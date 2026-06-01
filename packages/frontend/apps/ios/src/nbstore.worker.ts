import './setup-worker';

import { broadcastChannelStorages } from '@affine/nbstore/broadcast-channel';
import {
  cloudStorages,
  configureSocketAuthMethod,
} from '@affine/nbstore/cloud';
import { idbStoragesIndexerOnly } from '@affine/nbstore/idb';
import {
  bindNativeDBApis,
  type NativeDBApis,
  sqliteStorages,
} from '@affine/nbstore/sqlite';
import {
  StoreManagerConsumer,
  type WorkerManagerOps,
} from '@affine/nbstore/worker/consumer';
import { type MessageCommunicapable, OpConsumer } from '@toeverything/infra/op';
import { AsyncCall } from 'async-call-rpc';

let authTokenPort: MessagePort | undefined;
const pendingTokenRequests = new Map<string, (token: string | null) => void>();

configureSocketAuthMethod((endpoint, cb) => {
  readEndpointToken(endpoint)
    .then(token => cb(token ? { token, tokenType: 'jwt' } : {}))
    .catch(() => cb({}));
});

globalThis.addEventListener('message', e => {
  if (e.data.type === 'native-auth-token-channel') {
    authTokenPort = e.ports[0] as MessagePort;
    authTokenPort.addEventListener('message', e => {
      const { id, token } = e.data as { id?: string; token?: string | null };
      if (!id) return;
      pendingTokenRequests.get(id)?.(token ?? null);
      pendingTokenRequests.delete(id);
    });
    authTokenPort.start();
    return;
  }

  if (e.data.type === 'native-db-api-channel') {
    const port = e.ports[0] as MessagePort;
    const rpc = AsyncCall<NativeDBApis>(
      {},
      {
        channel: {
          on(listener) {
            const f = (e: MessageEvent<any>) => {
              listener(e.data);
            };
            port.addEventListener('message', f);
            return () => {
              port.removeEventListener('message', f);
            };
          },
          send(data) {
            port.postMessage(data);
          },
        },
      }
    );
    bindNativeDBApis(rpc);
    port.start();
  }
});

function readEndpointToken(endpoint: string) {
  if (!authTokenPort) {
    return Promise.resolve(null);
  }

  const id = `${Date.now()}:${Math.random()}`;
  return new Promise<string | null>(resolve => {
    const timeout = setTimeout(() => {
      pendingTokenRequests.delete(id);
      resolve(null);
    }, 5000);
    pendingTokenRequests.set(id, token => {
      clearTimeout(timeout);
      resolve(token);
    });
    authTokenPort?.postMessage({ id, endpoint });
  });
}

const consumer = new OpConsumer<WorkerManagerOps>(
  globalThis as MessageCommunicapable
);

const storeManager = new StoreManagerConsumer([
  ...idbStoragesIndexerOnly,
  ...sqliteStorages,
  ...broadcastChannelStorages,
  ...cloudStorages,
]);

storeManager.bindConsumer(consumer);
