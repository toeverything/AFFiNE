import type { DatasourceDocAdapter } from '@affine/y-provider';
import type { Socket } from 'socket.io-client';
import { Manager } from 'socket.io-client';
import {
  applyAwarenessUpdate,
  type Awareness,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness';
import type { Doc } from 'yjs';

import {
  type AwarenessChanges,
  base64ToUint8Array,
  uint8ArrayToBase64,
} from './utils';

let ioManager: Manager | null = null;
// use lazy initialization to avoid global side effect
function getIoManager(): Manager {
  if (ioManager) {
    return ioManager;
  }
  ioManager = new Manager(runtimeConfig.serverUrlPrefix + '/', {
    autoConnect: false,
  });
  return ioManager;
}

export const createAffineDataSource = (
  id: string,
  rootDoc: Doc,
  awareness: Awareness
) => {
  if (id !== rootDoc.guid) {
    console.warn('important!! please use doc.guid as roomName');
  }

  const socket = getIoManager().socket('/');

  return {
    get socket() {
      return socket;
    },
    queryDocState: async (guid, options) => {
      const stateVector = options?.stateVector
        ? await uint8ArrayToBase64(options.stateVector)
        : undefined;

      return new Promise((resolve, reject) => {
        socket.emit(
          'doc-load',
          {
            workspaceId: rootDoc.guid,
            guid,
            stateVector,
          },
          (docState: Error | { missing: string; state: string } | null) => {
            if (docState instanceof Error) {
              reject(docState);
              return;
            }

            resolve(
              docState
                ? {
                    missing: base64ToUint8Array(docState.missing),
                    state: docState.state
                      ? base64ToUint8Array(docState.state)
                      : undefined,
                  }
                : false
            );
          }
        );
      });
    },
    sendDocUpdate: async (guid: string, update: Uint8Array) => {
      socket.emit('client-update', {
        workspaceId: rootDoc.guid,
        guid,
        update: await uint8ArrayToBase64(update),
      });

      return Promise.resolve();
    },
    onDocUpdate: callback => {
      socket.on('connect', () => {
        socket.emit('client-handshake', rootDoc.guid);
      });
      const onUpdate = async (message: {
        workspaceId: string;
        guid: string;
        update: string;
      }) => {
        if (message.workspaceId === rootDoc.guid) {
          callback(message.guid, base64ToUint8Array(message.update));
        }
      };
      socket.on('server-update', onUpdate);
      const destroyAwareness = setupAffineAwareness(socket, rootDoc, awareness);

      socket.connect();
      return () => {
        socket.emit('client-leave', rootDoc.guid);
        socket.off('server-update', onUpdate);
        destroyAwareness();
        socket.disconnect();
      };
    },
  } satisfies DatasourceDocAdapter & { readonly socket: Socket };
};

function setupAffineAwareness(
  conn: Socket,
  rootDoc: Doc,
  awareness: Awareness
) {
  const awarenessBroadcast = ({
    workspaceId,
    awarenessUpdate,
  }: {
    workspaceId: string;
    awarenessUpdate: string;
  }) => {
    if (workspaceId !== rootDoc.guid) {
      return;
    }

    applyAwarenessUpdate(
      awareness,
      base64ToUint8Array(awarenessUpdate),
      'server'
    );
  };

  const awarenessUpdate = (changes: AwarenessChanges, origin: unknown) => {
    if (origin === 'server') {
      return;
    }

    const changedClients = Object.values(changes).reduce((res, cur) => [
      ...res,
      ...cur,
    ]);

    const update = encodeAwarenessUpdate(awareness, changedClients);
    uint8ArrayToBase64(update)
      .then(encodedUpdate => {
        conn.emit('awareness-update', {
          workspaceId: rootDoc.guid,
          awarenessUpdate: encodedUpdate,
        });
      })
      .catch(err => console.error(err));
  };

  const newClientAwarenessInitHandler = () => {
    const awarenessUpdate = encodeAwarenessUpdate(awareness, [
      awareness.clientID,
    ]);
    uint8ArrayToBase64(awarenessUpdate)
      .then(encodedAwarenessUpdate => {
        conn.emit('awareness-update', {
          guid: rootDoc.guid,
          awarenessUpdate: encodedAwarenessUpdate,
        });
      })
      .catch(err => console.error(err));
  };

  conn.on('server-awareness-broadcast', awarenessBroadcast);
  conn.on('new-client-awareness-init', newClientAwarenessInitHandler);
  awareness.on('update', awarenessUpdate);

  conn.on('connect', () => {
    conn.emit('awareness-init', rootDoc.guid);
  });

  return () => {
    awareness.off('update', awarenessUpdate);
    conn.off('server-awareness-broadcast', awarenessBroadcast);
    conn.off('new-client-awareness-init', newClientAwarenessInitHandler);
  };
}
