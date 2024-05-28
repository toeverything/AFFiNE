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

  constructor(
    private readonly workspaceId: string,
    private readonly socket: Socket
  ) {}

  connect(awareness: Awareness): void {
    this.socket.on('server-awareness-broadcast', this.awarenessBroadcast);
    this.socket.on(
      'new-client-awareness-init',
      this.newClientAwarenessInitHandler
    );
    this.awareness = awareness;
    this.awareness.on('update', this.awarenessUpdate);

    window.addEventListener('beforeunload', this.windowBeforeUnloadHandler);

    this.socket.on('connect', this.handleConnect);
    this.socket.on('server-version-rejected', this.handleReject);

    if (this.socket.connected) {
      this.handleConnect();
    } else {
      this.socket.connect();
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

    this.socket.emit('client-leave-awareness', this.workspaceId);
    this.socket.off('server-awareness-broadcast', this.awarenessBroadcast);
    this.socket.off(
      'new-client-awareness-init',
      this.newClientAwarenessInitHandler
    );
    this.socket.off('connect', this.handleConnect);
    this.socket.off('server-version-rejected', this.handleReject);
    window.removeEventListener('unload', this.windowBeforeUnloadHandler);
  }

  awarenessBroadcast = ({
    workspaceId: wsId,
    awarenessUpdate,
  }: {
    workspaceId: string;
    awarenessUpdate: string;
  }) => {
    if (!this.awareness) {
      return;
    }
    if (wsId !== this.workspaceId) {
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
        this.socket.emit('awareness-update', {
          workspaceId: this.workspaceId,
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
        this.socket.emit('awareness-update', {
          workspaceId: this.workspaceId,
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
      'client-handshake-awareness',
      {
        workspaceId: this.workspaceId,
        version: runtimeConfig.appVersion,
      },
      (res: any) => {
        logger.debug('awareness handshake finished', res);
        this.socket.emit('awareness-init', this.workspaceId, (res: any) => {
          logger.debug('awareness-init finished', res);
        });
      }
    );
  };

  handleReject = () => {
    this.socket.off('server-version-rejected', this.handleReject);
    this.disconnect();
    this.socket.disconnect();
  };
}
