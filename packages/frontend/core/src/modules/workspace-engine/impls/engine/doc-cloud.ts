import type { WebSocketService } from '@affine/core/modules/cloud';
import { DebugLogger } from '@affine/debug';
import {
  ErrorNames,
  UserFriendlyError,
  type UserFriendlyErrorResponse,
} from '@affine/graphql';
import type { DocServer } from '@toeverything/infra';
import { throwIfAborted } from '@toeverything/infra';
import type { Socket } from 'socket.io-client';

import { base64ToUint8Array, uint8ArrayToBase64 } from '../../utils/base64';

(window as any)._TEST_SIMULATE_SYNC_LAG = Promise.resolve();

const logger = new DebugLogger('affine-cloud-doc-engine-server');

type WebsocketResponse<T> = { error: UserFriendlyErrorResponse } | { data: T };

export class CloudDocEngineServer implements DocServer {
  interruptCb: ((reason: string) => void) | null = null;
  SEND_TIMEOUT = 30000;

  socket: Socket;
  disposeSocket: () => void;

  constructor(
    private readonly workspaceId: string,
    webSocketService: WebSocketService
  ) {
    const { socket, dispose } = webSocketService.connect();
    this.socket = socket;
    this.disposeSocket = dispose;
  }

  private async clientHandShake() {
    await this.socket.emitWithAck('space:join', {
      spaceType: 'workspace',
      spaceId: this.workspaceId,
      clientVersion: BUILD_CONFIG.appVersion,
    });
  }

  async pullDoc(docId: string, state: Uint8Array) {
    // for testing
    await (window as any)._TEST_SIMULATE_SYNC_LAG;

    const stateVector = state ? await uint8ArrayToBase64(state) : undefined;

    const response: WebsocketResponse<{
      missing: string;
      state: string;
      timestamp: number;
    }> = await this.socket
      .timeout(this.SEND_TIMEOUT)
      .emitWithAck('space:load-doc', {
        spaceType: 'workspace',
        spaceId: this.workspaceId,
        docId: docId,
        stateVector,
      });

    if ('error' in response) {
      const error = new UserFriendlyError(response.error);
      if (error.name === ErrorNames.DOC_NOT_FOUND) {
        return null;
      } else {
        throw error;
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

    const response: WebsocketResponse<{ timestamp: number }> = await this.socket
      .timeout(this.SEND_TIMEOUT)
      .emitWithAck('space:push-doc-updates', {
        spaceType: 'workspace',
        spaceId: this.workspaceId,
        docId: docId,
        updates: [payload],
      });

    if ('error' in response) {
      logger.error('client-update-v2 error', {
        workspaceId: this.workspaceId,
        guid: docId,
        response,
      });

      throw new UserFriendlyError(response.error);
    }

    return { serverClock: response.data.timestamp };
  }
  async loadServerClock(after: number): Promise<Map<string, number>> {
    const response: WebsocketResponse<Record<string, number>> =
      await this.socket
        .timeout(this.SEND_TIMEOUT)
        .emitWithAck('space:load-doc-timestamps', {
          spaceType: 'workspace',
          spaceId: this.workspaceId,
          timestamp: after,
        });

    if ('error' in response) {
      logger.error('client-pre-sync error', {
        workspaceId: this.workspaceId,
        response,
      });

      throw new UserFriendlyError(response.error);
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
      spaceType: string;
      spaceId: string;
      docId: string;
      updates: string[];
      timestamp: number;
    }) => {
      if (
        message.spaceType === 'workspace' &&
        message.spaceId === this.workspaceId
      ) {
        message.updates.forEach(update => {
          cb({
            docId: message.docId,
            data: base64ToUint8Array(update),
            serverClock: message.timestamp,
          });
        });
      }
    };
    this.socket.on('space:broadcast-doc-updates', handleUpdate);

    return () => {
      this.socket.off('space:broadcast-doc-updates', handleUpdate);
    };
  }
  async waitForConnectingServer(signal: AbortSignal): Promise<void> {
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
    this.socket.emit('space:leave', {
      spaceType: 'workspace',
      spaceId: this.workspaceId,
    });
    this.socket.off('server-version-rejected', this.handleVersionRejected);
    this.socket.off('disconnect', this.handleDisconnect);
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

  dispose(): void {
    this.disconnectServer();
    this.disposeSocket();
  }
}
