import { DebugLogger } from '@affine/debug';
import type { Socket } from 'socket.io-client';
import { Manager } from 'socket.io-client';
import {
  applyAwarenessUpdate,
  type Awareness,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import type { DocDataSource } from 'y-provider';
import type { Doc } from 'yjs';

import { MultipleBatchSyncSender } from './batch-sync-sender';
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
    transports: ['websocket'],
  });
  return ioManager;
}

const logger = new DebugLogger('affine:sync');

export const createAffineDataSource = (
  id: string,
  rootDoc: Doc,
  awareness: Awareness
) => {
  if (id !== rootDoc.guid) {
    console.warn('important!! please use doc.guid as roomName');
  }

  logger.debug('createAffineDataSource', id, rootDoc.guid);
  const socket = getIoManager().socket('/');
  const syncSender = new MultipleBatchSyncSender(async (guid, updates) => {
    const payload = await Promise.all(
      updates.map(update => uint8ArrayToBase64(update))
    );

    return new Promise(resolve => {
      socket.emit(
        'client-update-v2',
        {
          workspaceId: rootDoc.guid,
          guid,
          updates: payload,
        },
        (response: {
          // TODO: reuse `EventError` with server
          error?: any;
          data: any;
        }) => {
          // TODO: raise error with different code to users
          if (response.error) {
            logger.error('client-update-v2 error', {
              workspaceId: rootDoc.guid,
              guid,
              response,
            });
          }

          resolve({
            accepted: !response.error,
            // TODO: reuse `EventError` with server
            retry: response.error?.code === 'INTERNAL',
          });
        }
      );
    });
  });

  return {
    get socket() {
      return socket;
    },
    queryDocState: async (guid, options) => {
      const stateVector = options?.stateVector
        ? await uint8ArrayToBase64(options.stateVector)
        : undefined;

      return new Promise((resolve, reject) => {
        logger.debug('doc-load-v2', {
          workspaceId: rootDoc.guid,
          guid,
          stateVector,
        });
        socket.emit(
          'doc-load-v2',
          {
            workspaceId: rootDoc.guid,
            guid,
            stateVector,
          },
          (
            response: // TODO: reuse `EventError` with server
            { error: any } | { data: { missing: string; state: string } }
          ) => {
            logger.debug('doc-load callback', {
              workspaceId: rootDoc.guid,
              guid,
              stateVector,
              response,
            });

            if ('error' in response) {
              // TODO: result `EventError` with server
              if (response.error.code === 'DOC_NOT_FOUND') {
                resolve(false);
              } else {
                reject(new Error(response.error.message));
              }
            } else {
              resolve({
                missing: base64ToUint8Array(response.data.missing),
                state: response.data.state
                  ? base64ToUint8Array(response.data.state)
                  : undefined,
              });
            }
          }
        );
      });
    },
    sendDocUpdate: async (guid: string, update: Uint8Array) => {
      logger.debug('client-update-v2', {
        workspaceId: rootDoc.guid,
        guid,
        update,
      });

      await syncSender.send(guid, update);
    },
    onDocUpdate: callback => {
      const onUpdate = async (message: {
        workspaceId: string;
        guid: string;
        updates: string[];
      }) => {
        if (message.workspaceId === rootDoc.guid) {
          message.updates.forEach(update => {
            callback(message.guid, base64ToUint8Array(update));
          });
        }
      };
      let destroyAwareness = () => {};
      socket.on('server-updates', onUpdate);
      socket.on('connect', () => {
        socket.emit(
          'client-handshake',
          rootDoc.guid,
          (response: { error?: any }) => {
            if (!response.error) {
              syncSender.start();
              destroyAwareness = setupAffineAwareness(
                socket,
                rootDoc,
                awareness
              );
            }
          }
        );
      });

      socket.connect();
      return () => {
        syncSender.stop();
        socket.emit('client-leave', rootDoc.guid);
        socket.off('server-updates', onUpdate);
        destroyAwareness();
        socket.disconnect();
      };
    },
  } satisfies DocDataSource & { readonly socket: Socket };
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
      .catch(err => logger.error(err));
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
      .catch(err => logger.error(err));
  };

  const windowBeforeUnloadHandler = () => {
    removeAwarenessStates(awareness, [awareness.clientID], 'window unload');
  };

  conn.on('server-awareness-broadcast', awarenessBroadcast);
  conn.on('new-client-awareness-init', newClientAwarenessInitHandler);
  awareness.on('update', awarenessUpdate);

  window.addEventListener('beforeunload', windowBeforeUnloadHandler);

  conn.emit('awareness-init', rootDoc.guid);

  return () => {
    awareness.off('update', awarenessUpdate);
    conn.off('server-awareness-broadcast', awarenessBroadcast);
    conn.off('new-client-awareness-init', newClientAwarenessInitHandler);
    window.removeEventListener('unload', windowBeforeUnloadHandler);
  };
}
