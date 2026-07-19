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
const pendingTokenRequests = new Map<
  string,
  {
    resolve: (token: string | null) => void;
    reject: (error: Error) => void;
  }
>();

configureSocketAuthMethod((endpoint, cb) => {
  getValidAccessToken(endpoint)
    .then(token => cb(token ? { token, tokenType: 'jwt' } : {}))
    .catch(() => cb({ error: 'AUTH_SESSION_TEMPORARILY_UNAVAILABLE' }));
});

globalThis.addEventListener('message', e => {
  if (e.data.type === 'auth-access-token-channel') {
    authTokenPort = e.ports[0] as MessagePort;
    authTokenPort.addEventListener('message', e => {
      const { id, token, error } = e.data as {
        id?: string;
        token?: string | null;
        error?: string;
      };
      if (!id) return;
      const pending = pendingTokenRequests.get(id);
      if (error) {
        if (
          [
            'ACCESS_TOKEN_INVALID',
            'AUTH_SESSION_EXPIRED',
            'AUTH_SESSION_REVOKED',
            'REFRESH_TOKEN_INVALID',
            'REFRESH_TOKEN_REUSED',
            'UNSUPPORTED_CLIENT_VERSION',
            'AUTH_SESSION_EMPTY',
          ].includes(error)
        ) {
          pending?.resolve(null);
        } else {
          pending?.reject(new Error(error));
        }
      } else {
        pending?.resolve(token ?? null);
      }
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

function getValidAccessToken(endpoint: string) {
  if (!authTokenPort) {
    return Promise.resolve(null);
  }

  const id = `${Date.now()}:${Math.random()}`;
  return new Promise<string | null>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingTokenRequests.delete(id);
      reject(new Error('AUTH_SESSION_TEMPORARILY_UNAVAILABLE'));
    }, 5000);
    pendingTokenRequests.set(id, {
      resolve: token => {
        clearTimeout(timeout);
        resolve(token);
      },
      reject: error => {
        clearTimeout(timeout);
        reject(error);
      },
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
