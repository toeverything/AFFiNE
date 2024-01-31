import { DebugLogger } from '@affine/debug';
import { fetchWithTraceReport } from '@affine/graphql';
import { type SyncStorage } from '@toeverything/infra';
import type { CleanupService } from '@toeverything/infra/lifecycle';

import { getIoManager } from '../../utils/affine-io';
import { base64ToUint8Array, uint8ArrayToBase64 } from '../../utils/base64';
import { MultipleBatchSyncSender } from './batch-sync-sender';

const logger = new DebugLogger('affine:storage:socketio');

export class AffineSyncStorage implements SyncStorage {
  name = 'affine-cloud';

  socket = getIoManager().socket('/');

  syncSender = new MultipleBatchSyncSender(async (guid, updates) => {
    const payload = await Promise.all(
      updates.map(update => uint8ArrayToBase64(update))
    );

    return new Promise(resolve => {
      this.socket.emit(
        'client-update-v2',
        {
          workspaceId: this.workspaceId,
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
              workspaceId: this.workspaceId,
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

  constructor(
    private readonly workspaceId: string,
    cleanupService: CleanupService
  ) {
    this.socket.on('connect', this.handleConnect);

    this.socket.connect();

    this.socket.emit(
      'client-handshake-sync',
      this.workspaceId,
      (response: { error?: any }) => {
        if (!response.error) {
          this.syncSender.start();
        }
      }
    );

    cleanupService.add(() => {
      this.cleanup();
    });
  }

  handleConnect = () => {
    this.socket.emit(
      'client-handshake-sync',
      this.workspaceId,
      (response: { error?: any }) => {
        if (!response.error) {
          this.syncSender.start();
        }
      }
    );
  };

  async pull(
    docId: string,
    state: Uint8Array
  ): Promise<{ data: Uint8Array; state?: Uint8Array } | null> {
    const stateVector = state ? await uint8ArrayToBase64(state) : undefined;

    return new Promise((resolve, reject) => {
      logger.debug('doc-load-v2', {
        workspaceId: this.workspaceId,
        guid: docId,
        stateVector,
      });
      this.socket.emit(
        'doc-load-v2',
        {
          workspaceId: this.workspaceId,
          guid: docId,
          stateVector,
        },
        (
          response: // TODO: reuse `EventError` with server
          { error: any } | { data: { missing: string; state: string } }
        ) => {
          logger.debug('doc-load callback', {
            workspaceId: this.workspaceId,
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
  }

  async push(docId: string, update: Uint8Array) {
    logger.debug('client-update-v2', {
      workspaceId: this.workspaceId,
      guid: docId,
      update,
    });

    await this.syncSender.send(docId, update);
  }

  async subscribe(
    cb: (docId: string, data: Uint8Array) => void,
    disconnect: (reason: string) => void
  ) {
    const handleUpdate = async (message: {
      workspaceId: string;
      guid: string;
      updates: string[];
    }) => {
      if (message.workspaceId === this.workspaceId) {
        message.updates.forEach(update => {
          cb(message.guid, base64ToUint8Array(update));
        });
      }
    };
    this.socket.on('server-updates', handleUpdate);

    this.socket.on('disconnect', reason => {
      this.socket.off('server-updates', handleUpdate);
      disconnect(reason);
    });

    return () => {
      this.socket.off('server-updates', handleUpdate);
    };
  }

  cleanup() {
    this.syncSender.stop();
    this.socket.emit('client-leave-sync', this.workspaceId);
    this.socket.off('connect', this.handleConnect);
  }
}

export class AffineStaticSyncStorage implements SyncStorage {
  name = 'affine-cloud-static';
  constructor(private readonly workspaceId: string) {}

  async pull(
    docId: string
  ): Promise<{ data: Uint8Array; state?: Uint8Array | undefined } | null> {
    const response = await fetchWithTraceReport(
      `/api/workspaces/${this.workspaceId}/docs/${docId}`,
      {
        priority: 'high',
      }
    );
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();

      return { data: new Uint8Array(arrayBuffer) };
    }

    return null;
  }
  push(): Promise<void> {
    throw new Error('Method not implemented.');
  }
  subscribe(): Promise<() => void> {
    throw new Error('Method not implemented.');
  }
}
