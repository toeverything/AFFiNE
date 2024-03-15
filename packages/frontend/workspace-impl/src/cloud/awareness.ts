import { DebugLogger } from '@affine/debug';
import type { AwarenessProvider, RejectByVersion } from '@toeverything/infra';
import {
  applyAwarenessUpdate,
  type Awareness,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';

import { getIoManager } from '../utils/affine-io';
import { base64ToUint8Array, uint8ArrayToBase64 } from '../utils/base64';

const logger = new DebugLogger('affine:awareness:socketio');

type AwarenessChanges = Record<'added' | 'updated' | 'removed', number[]>;

export class AffineCloudAwarenessProvider implements AwarenessProvider {
  socket = getIoManager().socket('/');

  constructor(
    private readonly workspaceId: string,
    private readonly awareness: Awareness
  ) {}

  connect(): void {
    this.socket.on('server-awareness-broadcast', this.awarenessBroadcast);
    this.socket.on(
      'new-client-awareness-init',
      this.newClientAwarenessInitHandler
    );
    this.awareness.on('update', this.awarenessUpdate);

    window.addEventListener('beforeunload', this.windowBeforeUnloadHandler);

    this.socket.on('connect', () => this.handleConnect());
    this.socket.on('server-version-rejected', this.handleReject);

    if (this.socket.connected) {
      this.handleConnect();
    } else {
      this.socket.connect();
    }
  }

  disconnect(): void {
    removeAwarenessStates(
      this.awareness,
      [this.awareness.clientID],
      'disconnect'
    );
    this.awareness.off('update', this.awarenessUpdate);
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

  handleReject = (_msg: RejectByVersion) => {
    this.socket.off('server-version-rejected', this.handleReject);
    this.disconnect();
    this.socket.disconnect();
  };
}
