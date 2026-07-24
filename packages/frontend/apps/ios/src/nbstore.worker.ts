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

import { configureAccessTokenProvider } from './proxy';

const AUTH_TOKEN_PORT_TIMEOUT_MS = 10_000;
const AUTH_TOKEN_REQUEST_TIMEOUT_MS = 15_000;

let authTokenPort: MessagePort | undefined;
const pendingAuthTokenPortResolvers = new Set<(port: MessagePort) => void>();
const terminalAuthErrors = new Set([
  'ACCESS_TOKEN_INVALID',
  'AUTH_SESSION_EXPIRED',
  'AUTH_SESSION_REVOKED',
  'REFRESH_TOKEN_INVALID',
  'REFRESH_TOKEN_REUSED',
  'UNSUPPORTED_CLIENT_VERSION',
  'AUTH_SESSION_EMPTY',
]);
const pendingTokenRequests = new Map<
  string,
  {
    resolve: (token: string | null) => void;
    reject: (error: Error) => void;
  }
>();

function waitForAuthTokenPort(timeoutMs = AUTH_TOKEN_PORT_TIMEOUT_MS) {
  if (authTokenPort) {
    return Promise.resolve(authTokenPort);
  }

  return new Promise<MessagePort>((resolve, reject) => {
    const onReady = (port: MessagePort) => {
      clearTimeout(timeout);
      pendingAuthTokenPortResolvers.delete(onReady);
      resolve(port);
    };
    const timeout = setTimeout(() => {
      pendingAuthTokenPortResolvers.delete(onReady);
      reject(new Error('AUTH_SESSION_TEMPORARILY_UNAVAILABLE'));
    }, timeoutMs);
    pendingAuthTokenPortResolvers.add(onReady);
  });
}

function requestAccessToken(
  endpoint: string,
  action: 'get' | 'refresh' = 'get'
) {
  const id = `${Date.now()}:${Math.random()}`;
  return waitForAuthTokenPort().then(
    port =>
      new Promise<string | null>((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingTokenRequests.delete(id);
          reject(new Error('AUTH_SESSION_TEMPORARILY_UNAVAILABLE'));
        }, AUTH_TOKEN_REQUEST_TIMEOUT_MS);
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
        port.postMessage({ id, endpoint, action });
      })
  );
}

async function getValidAccessToken(endpoint: string) {
  return requestAccessToken(endpoint, 'get');
}

async function refreshAccessToken(endpoint: string) {
  const token = await requestAccessToken(endpoint, 'refresh');
  if (!token) {
    throw new Error('AUTH_SESSION_TEMPORARILY_UNAVAILABLE');
  }
  return token;
}

// Capacitor plugins are unavailable inside the worker. Route all token reads
// and refreshes through the main-thread MessagePort bridge.
configureAccessTokenProvider({
  getValidAccessToken,
  refreshAccessToken,
});

configureSocketAuthMethod((endpoint, cb) => {
  getValidAccessToken(endpoint)
    .then(token => {
      cb(token ? { token, tokenType: 'jwt' } : {});
    })
    .catch(() => {
      cb({ error: 'AUTH_SESSION_TEMPORARILY_UNAVAILABLE' });
    });
});

globalThis.addEventListener('message', e => {
  if (e.data.type === 'auth-access-token-channel') {
    const port = e.ports[0] as MessagePort;
    authTokenPort = port;
    pendingAuthTokenPortResolvers.forEach(resolve => resolve(port));
    pendingAuthTokenPortResolvers.clear();
    port.addEventListener('message', e => {
      const { id, token, error } = e.data as {
        id?: string;
        token?: string | null;
        error?: string;
      };
      if (!id) return;
      const pending = pendingTokenRequests.get(id);
      if (error) {
        if (terminalAuthErrors.has(error)) {
          pending?.resolve(null);
        } else {
          pending?.reject(new Error(error));
        }
      } else {
        pending?.resolve(token ?? null);
      }
      pendingTokenRequests.delete(id);
    });
    port.start();
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
