import { DebugLogger } from '@affine/debug';

import { getIoManager } from '../../utils/affine-io';
import { base64ToUint8Array, uint8ArrayToBase64 } from '../../utils/base64';
import type { Storage } from '..';
import { MultipleBatchSyncSender } from './batch-sync-sender';

const logger = new DebugLogger('affine:storage:socketio');

export function createAffineStorage(
  workspaceId: string
): Storage & { disconnect: () => void } {
  logger.debug('createAffineStorage', workspaceId);
  const socket = getIoManager().socket('/');

  const syncSender = new MultipleBatchSyncSender(async (guid, updates) => {
    const payload = await Promise.all(
      updates.map(update => uint8ArrayToBase64(update))
    );

    return new Promise(resolve => {
      socket.emit(
        'client-update-v2',
        {
          workspaceId,
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
              workspaceId,
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

  // TODO: handle error
  socket.on('connect', () => {
    socket.emit(
      'client-handshake',
      workspaceId,
      (response: { error?: any }) => {
        if (!response.error) {
          syncSender.start();
        }
      }
    );
  });

  socket.connect();

  return {
    name: 'socketio',
    async pull(docId, state) {
      const stateVector = state ? await uint8ArrayToBase64(state) : undefined;

      return new Promise((resolve, reject) => {
        logger.debug('doc-load-v2', {
          workspaceId: workspaceId,
          guid: docId,
          stateVector,
        });
        socket.emit(
          'doc-load-v2',
          {
            workspaceId: workspaceId,
            guid: docId,
            stateVector,
          },
          (
            response: // TODO: reuse `EventError` with server
            { error: any } | { data: { missing: string; state: string } }
          ) => {
            logger.debug('doc-load callback', {
              workspaceId: workspaceId,
              guid: docId,
              stateVector,
              response,
            });

            if ('error' in response) {
              // TODO: result `EventError` with server
              if (response.error.code === 'DOC_NOT_FOUND') {
                resolve(null);
              } else {
                reject(new Error(response.error.message));
              }
            } else {
              resolve({
                data: base64ToUint8Array(response.data.missing),
                state: response.data.state
                  ? base64ToUint8Array(response.data.state)
                  : undefined,
              });
            }
          }
        );
      });
    },
    async push(docId, update) {
      logger.debug('client-update-v2', {
        workspaceId,
        guid: docId,
        update,
      });

      await syncSender.send(docId, update);
    },
    async subscribe(cb, disconnect) {
      const response: { error?: any } = await socket
        .timeout(10000)
        .emitWithAck('client-handshake', workspaceId);

      if (response.error) {
        throw new Error('client-handshake error, ' + response.error);
      }

      const handleUpdate = async (message: {
        workspaceId: string;
        guid: string;
        updates: string[];
      }) => {
        if (message.workspaceId === workspaceId) {
          message.updates.forEach(update => {
            cb(message.guid, base64ToUint8Array(update));
          });
        }
      };
      socket.on('server-updates', handleUpdate);

      socket.on('disconnect', reason => {
        socket.off('server-updates', handleUpdate);
        disconnect(reason);
      });

      return () => {
        socket.off('server-updates', handleUpdate);
      };
    },
    disconnect() {
      syncSender.stop();
      socket.emit('client-leave', workspaceId);
      socket.disconnect();
    },
  };
}
