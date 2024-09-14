import type { WebSocketService } from '@affine/core/modules/cloud';
import { DebugLogger } from '@affine/debug';
import type { AwarenessConnection } from '@toeverything/infra';
import type { Socket } from 'socket.io-client';
import type { Awareness } from 'y-protocols/awareness';
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';

import { base64ToUint8Array, uint8ArrayToBase64 } from '../../utils/base64';

const logger = new DebugLogger('affine:awareness:socketio');

type AwarenessChanges = Record<'added' | 'updated' | 'removed', number[]>;

export class CloudAwarenessConnection implements AwarenessConnection {
  awareness: Awareness | null = null;

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

  connect(awareness: Awareness): void {
    this.socket.on('space:broadcast-awareness-update', this.awarenessBroadcast);
    this.socket.on(
      'space:collect-awareness',
      this.newClientAwarenessInitHandler
    );
    this.awareness = awareness;
    this.awareness.on('update', this.awarenessUpdate);

    window.addEventListener('beforeunload', this.windowBeforeUnloadHandler);

    this.socket.on('connect', this.handleConnect);
    this.socket.on('server-version-rejected', this.handleReject);

    if (this.socket.connected) {
      this.handleConnect();
    }
  }

  disconnect(): void {
    if (this.awareness) {
      removeAwarenessStates(
        this.awareness,
        [this.awareness.clientID],
        'disconnect'
      );
      this.awareness.off('update', this.awarenessUpdate);
    }
    this.awareness = null;

    this.socket.emit('space:leave-awareness', {
      spaceType: 'workspace',
      spaceId: this.workspaceId,
      docId: this.workspaceId,
    });
    this.socket.off(
      'space:broadcast-awareness-update',
      this.awarenessBroadcast
    );
    this.socket.off(
      'space:collect-awareness',
      this.newClientAwarenessInitHandler
    );
    this.socket.off('connect', this.handleConnect);
    this.socket.off('server-version-rejected', this.handleReject);
    window.removeEventListener('unload', this.windowBeforeUnloadHandler);
  }

  awarenessBroadcast = ({
    spaceId: wsId,
    spaceType,
    awarenessUpdate,
  }: {
    spaceType: string;
    spaceId: string;
    docId: string;
    awarenessUpdate: string;
  }) => {
    if (!this.awareness) {
      return;
    }
    if (wsId !== this.workspaceId || spaceType !== 'workspace') {
      return;
    }
    applyAwarenessUpdate(
      this.awareness,
      base64ToUint8Array(awarenessUpdate),
      'remote'
    );
  };

  awarenessUpdate = (changes: AwarenessChanges, origin: unknown) => {
    if (!this.awareness) {
      return;
    }

    if (origin === 'remote') {
      return;
    }

    const changedClients = Object.values(changes).reduce((res, cur) =>
      res.concat(cur)
    );

    const update = encodeAwarenessUpdate(this.awareness, changedClients);
    uint8ArrayToBase64(update)
      .then(encodedUpdate => {
        this.socket.emit('space:update-awareness', {
          spaceType: 'workspace',
          spaceId: this.workspaceId,
          docId: this.workspaceId,
          awarenessUpdate: encodedUpdate,
        });
      })
      .catch(err => logger.error(err));
  };

  newClientAwarenessInitHandler = () => {
    if (!this.awareness) {
      return;
    }

    const awarenessUpdate = encodeAwarenessUpdate(this.awareness, [
      this.awareness.clientID,
    ]);
    uint8ArrayToBase64(awarenessUpdate)
      .then(encodedAwarenessUpdate => {
        this.socket.emit('space:update-awareness', {
          spaceType: 'workspace',
          spaceId: this.workspaceId,
          docId: this.workspaceId,
          awarenessUpdate: encodedAwarenessUpdate,
        });
      })
      .catch(err => logger.error(err));
  };

  windowBeforeUnloadHandler = () => {
    if (!this.awareness) {
      return;
    }

    removeAwarenessStates(
      this.awareness,
      [this.awareness.clientID],
      'window unload'
    );
  };

  handleConnect = () => {
    this.socket.emit(
      'space:join-awareness',
      {
        spaceType: 'workspace',
        spaceId: this.workspaceId,
        docId: this.workspaceId,
        clientVersion: BUILD_CONFIG.appVersion,
      },
      (res: any) => {
        logger.debug('awareness handshake finished', res);
        this.socket.emit(
          'space:load-awarenesses',
          {
            spaceType: 'workspace',
            spaceId: this.workspaceId,
            docId: this.workspaceId,
          },
          (res: any) => {
            logger.debug('awareness-init finished', res);
          }
        );
      }
    );
  };

  handleReject = () => {
    this.socket.off('server-version-rejected', this.handleReject);
  };

  dispose() {
    this.disconnect();
    this.disposeSocket();
  }
}
