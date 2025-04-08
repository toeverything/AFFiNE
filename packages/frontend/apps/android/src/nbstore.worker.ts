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

import { readEndpointToken } from './proxy';

configureSocketAuthMethod((endpoint, cb) => {
  readEndpointToken(endpoint)
    .then(token => {
      cb({ token });
    })
    .catch(e => {
      console.error(e);
    });
});

globalThis.addEventListener('message', e => {
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
