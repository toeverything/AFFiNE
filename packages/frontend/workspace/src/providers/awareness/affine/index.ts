import { DebugLogger } from '@affine/debug';
import {
  applyAwarenessUpdate,
  type Awareness,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';

import { getIoManager } from '../../utils/affine-io';
import { base64ToUint8Array, uint8ArrayToBase64 } from '../../utils/base64';
import type { AwarenessProvider } from '..';

const logger = new DebugLogger('affine:awareness:socketio');

export type AwarenessChanges = Record<
  'added' | 'updated' | 'removed',
  number[]
>;

export function createAffineAwarenessProvider(
  workspaceId: string,
  awareness: Awareness
): AwarenessProvider {
  const socket = getIoManager().socket('/');

  const awarenessBroadcast = ({
    workspaceId: wsId,
    awarenessUpdate,
  }: {
    workspaceId: string;
    awarenessUpdate: string;
  }) => {
    if (wsId !== workspaceId) {
      return;
    }
    applyAwarenessUpdate(
      awareness,
      base64ToUint8Array(awarenessUpdate),
      'remote'
    );
  };

  const awarenessUpdate = (changes: AwarenessChanges, origin: unknown) => {
    if (origin === 'remote') {
      return;
    }

    const changedClients = Object.values(changes).reduce((res, cur) => [
      ...res,
      ...cur,
    ]);

    const update = encodeAwarenessUpdate(awareness, changedClients);
    uint8ArrayToBase64(update)
      .then(encodedUpdate => {
        socket.emit('awareness-update', {
          workspaceId: workspaceId,
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
        socket.emit('awareness-update', {
          guid: workspaceId,
          awarenessUpdate: encodedAwarenessUpdate,
        });
      })
      .catch(err => logger.error(err));
  };

  const windowBeforeUnloadHandler = () => {
    removeAwarenessStates(awareness, [awareness.clientID], 'window unload');
  };

  return {
    connect: () => {
      socket.on('server-awareness-broadcast', awarenessBroadcast);
      socket.on('new-client-awareness-init', newClientAwarenessInitHandler);
      awareness.on('update', awarenessUpdate);

      window.addEventListener('beforeunload', windowBeforeUnloadHandler);

      socket.emit('awareness-init', workspaceId);
      socket.connect();
    },
    disconnect: () => {
      awareness.off('update', awarenessUpdate);
      socket.off('server-awareness-broadcast', awarenessBroadcast);
      socket.off('new-client-awareness-init', newClientAwarenessInitHandler);
      window.removeEventListener('unload', windowBeforeUnloadHandler);
      socket.disconnect();
    },
  };
}
