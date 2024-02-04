import { DebugLogger } from '@affine/debug';
import { fetchWithTraceReport } from '@affine/graphql';
import { type SyncStorage } from '@affine/workspace';
import {
  BehaviorSubject,
  distinctUntilChanged,
  filter,
  lastValueFrom,
  take,
  timeout,
} from 'rxjs';

import { getIoManager } from '../../utils/affine-io';
import { base64ToUint8Array, uint8ArrayToBase64 } from '../../utils/base64';

const logger = new DebugLogger('affine:storage:socketio');

export class AffineSyncStorage implements SyncStorage {
  name = 'affine-cloud';

  SEND_TIMEOUT = 30000;

  socket = getIoManager().socket('/');

  connected = new BehaviorSubject(false);
  handshook = new BehaviorSubject(false);

  constructor(private readonly workspaceId: string) {
    const handleConnect = () => {
      this.connected.next(true);
    };
    this.socket.on('connect', handleConnect);
    this.connected.next(this.socket.connected);

    const handleDisconnect = () => {
      this.connected.next(false);
      this.handshook.next(false);
    };
    this.socket.on('disconnect', handleDisconnect);

    this.connected.pipe(distinctUntilChanged()).subscribe(connected => {
      if (connected) {
        this.socket
          .timeout(this.SEND_TIMEOUT)
          .emitWithAck('client-handshake-sync', this.workspaceId)
          .then(() => {
            this.handshook.next(true);
          })
          .catch(err => {
            logger.error('client-handshake-sync error', {
              workspaceId: this.workspaceId,
              error: err,
            });
          });
      }
    });

    this.disconnect = () => {
      this.socket.emit('client-leave-sync', this.workspaceId);
      this.socket.off('connect', handleConnect);
      this.socket.off('disconnect', handleDisconnect);
    };
  }

  async waitForHandshake() {
    await lastValueFrom(
      this.handshook.pipe(
        filter(v => v),
        timeout({ first: this.SEND_TIMEOUT }),
        take(1)
      )
    );
  }

  handleConnect = () => {
    this.socket.emit('client-handshake-sync', this.workspaceId);
  };

  async pull(
    docId: string,
    state: Uint8Array
  ): Promise<{ data: Uint8Array; state?: Uint8Array } | null> {
    await this.waitForHandshake();
    const stateVector = state ? await uint8ArrayToBase64(state) : undefined;

    logger.debug('doc-load-v2', {
      workspaceId: this.workspaceId,
      guid: docId,
      stateVector,
    });

    const response:
      | { error: any }
      | { data: { missing: string; state: string } } = await this.socket
      .timeout(this.SEND_TIMEOUT)
      .emitWithAck('doc-load-v2', {
        workspaceId: this.workspaceId,
        guid: docId,
        stateVector,
      });

    logger.debug('doc-load callback', {
      workspaceId: this.workspaceId,
      guid: docId,
      stateVector,
      response,
    });

    if ('error' in response) {
      // TODO: result `EventError` with server
      if (response.error.code === 'DOC_NOT_FOUND') {
        return null;
      } else {
        throw new Error(response.error.message);
      }
    } else {
      return {
        data: base64ToUint8Array(response.data.missing),
        state: response.data.state
          ? base64ToUint8Array(response.data.state)
          : undefined,
      };
    }
  }

  async push(docId: string, update: Uint8Array) {
    await this.waitForHandshake();

    logger.debug('client-update-v2', {
      workspaceId: this.workspaceId,
      guid: docId,
      update,
    });

    const payload = await uint8ArrayToBase64(update);

    const response: {
      // TODO: reuse `EventError` with server
      error?: any;
      data: any;
    } = await this.socket
      .timeout(this.SEND_TIMEOUT)
      .emitWithAck('client-update-v2', {
        workspaceId: this.workspaceId,
        guid: docId,
        updates: [payload],
      });

    // TODO: raise error with different code to users
    if (response.error) {
      logger.error('client-update-v2 error', {
        workspaceId: this.workspaceId,
        guid: docId,
        response,
      });

      throw new Error(response.error);
    }
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
    const handleDisconnect = (reason: string) => {
      this.socket.off('server-updates', handleUpdate);
      disconnect(reason);
    };
    this.socket.on('server-updates', handleUpdate);

    this.socket.on('disconnect', handleDisconnect);

    return () => {
      this.socket.off('server-updates', handleUpdate);
      this.socket.off('disconnect', handleDisconnect);
    };
  }

  disconnect: () => void;
}

export function createAffineStorage(
  workspaceId: string
): SyncStorage & { disconnect: () => void } {
  return new AffineSyncStorage(workspaceId);
}

export function createAffineStaticStorage(workspaceId: string): SyncStorage {
  logger.debug('createAffineStaticStorage', workspaceId);

  return {
    name: 'affine-cloud-static',
    async pull(docId) {
      const response = await fetchWithTraceReport(
        `/api/workspaces/${workspaceId}/docs/${docId}`,
        {
          priority: 'high',
        }
      );
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();

        return { data: new Uint8Array(arrayBuffer) };
      }

      return null;
    },
    async push() {
      throw new Error('Not implemented');
    },
    async subscribe() {
      throw new Error('Not implemented');
    },
  };
}
