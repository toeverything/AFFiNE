import { DebugLogger } from '@affine/debug';
import type { DocServer } from '@toeverything/infra';
import { throwIfAborted } from '@toeverything/infra';
import type { Socket } from 'socket.io-client';

import { getIoManager } from '../../utils/affine-io';
import { base64ToUint8Array, uint8ArrayToBase64 } from '../../utils/base64';

(window as any)._TEST_SIMULATE_SYNC_LAG = Promise.resolve();

const logger = new DebugLogger('affine-cloud-doc-engine-server');

export class CloudDocEngineServer implements DocServer {
  socket = null as unknown as Socket;
  interruptCb: ((reason: string) => void) | null = null;
  SEND_TIMEOUT = 30000;

  constructor(private readonly workspaceId: string) {}

  private async clientHandShake() {
    await this.socket.emitWithAck('client-handshake-sync', {
      workspaceId: this.workspaceId,
      version: runtimeConfig.appVersion,
    });
  }

  async pullDoc(docId: string, state: Uint8Array) {
    // for testing
    await (window as any)._TEST_SIMULATE_SYNC_LAG;

    const stateVector = state ? await uint8ArrayToBase64(state) : undefined;

    const response:
      | { error: any }
      | { data: { missing: string; state: string; timestamp: number } } =
      await this.socket.timeout(this.SEND_TIMEOUT).emitWithAck('doc-load-v2', {
        workspaceId: this.workspaceId,
        guid: docId,
        stateVector,
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
        stateVector: response.data.state
          ? base64ToUint8Array(response.data.state)
          : undefined,
        serverClock: response.data.timestamp,
      };
    }
  }
  async pushDoc(docId: string, data: Uint8Array) {
    const payload = await uint8ArrayToBase64(data);

    const response: {
      // TODO: reuse `EventError` with server
      error?: any;
      data: { timestamp: number };
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

    return { serverClock: response.data.timestamp };
  }
  async loadServerClock(after: number): Promise<Map<string, number>> {
    const response: {
      // TODO: reuse `EventError` with server
      error?: any;
      data: Record<string, number>;
    } = await this.socket
      .timeout(this.SEND_TIMEOUT)
      .emitWithAck('client-pre-sync', {
        workspaceId: this.workspaceId,
        timestamp: after,
      });

    if (response.error) {
      logger.error('client-pre-sync error', {
        workspaceId: this.workspaceId,
        response,
      });

      throw new Error(response.error);
    }

    return new Map(Object.entries(response.data));
  }
  async subscribeAllDocs(
    cb: (updates: {
      docId: string;
      data: Uint8Array;
      serverClock: number;
    }) => void
  ): Promise<() => void> {
    const handleUpdate = async (message: {
      workspaceId: string;
      guid: string;
      updates: string[];
      timestamp: number;
    }) => {
      if (message.workspaceId === this.workspaceId) {
        message.updates.forEach(update => {
          cb({
            docId: message.guid,
            data: base64ToUint8Array(update),
            serverClock: message.timestamp,
          });
        });
      }
    };
    this.socket.on('server-updates', handleUpdate);

    return () => {
      this.socket.off('server-updates', handleUpdate);
    };
  }
  async waitForConnectingServer(signal: AbortSignal): Promise<void> {
    const socket = getIoManager().socket('/');
    this.socket = socket;
    this.socket.on('server-version-rejected', this.handleVersionRejected);
    this.socket.on('disconnect', this.handleDisconnect);

    throwIfAborted(signal);
    if (this.socket.connected) {
      await this.clientHandShake();
    } else {
      this.socket.connect();
      await new Promise<void>((resolve, reject) => {
        this.socket.on('connect', () => {
          resolve();
        });
        signal.addEventListener('abort', () => {
          reject('aborted');
        });
      });
      throwIfAborted(signal);
      await this.clientHandShake();
    }
  }
  disconnectServer(): void {
    if (!this.socket) {
      return;
    }

    this.socket.emit('client-leave-sync', this.workspaceId);
    this.socket.off('server-version-rejected', this.handleVersionRejected);
    this.socket.off('disconnect', this.handleDisconnect);
    this.socket = null as unknown as Socket;
  }
  onInterrupted = (cb: (reason: string) => void) => {
    this.interruptCb = cb;
  };
  handleInterrupted = (reason: string) => {
    this.interruptCb?.(reason);
  };
  handleDisconnect = (reason: Socket.DisconnectReason) => {
    this.interruptCb?.(reason);
  };
  handleVersionRejected = () => {
    this.interruptCb?.('Client version rejected');
  };
}
