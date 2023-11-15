import type { Awareness } from 'y-protocols/awareness.js';
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness.js';

import type { AwarenessProvider } from '..';
import type { AwarenessChanges } from '../affine';

type ChannelMessage =
  | { type: 'connect' }
  | { type: 'update'; update: Uint8Array };

export function createBroadcastChannelAwarenessProvider(
  workspaceId: string,
  awareness: Awareness
): AwarenessProvider {
  const channel = new BroadcastChannel('awareness:' + workspaceId);

  function handleAwarenessUpdate(changes: AwarenessChanges, origin: unknown) {
    if (origin === 'remote') {
      return;
    }

    const changedClients = Object.values(changes).reduce((res, cur) => [
      ...res,
      ...cur,
    ]);

    const update = encodeAwarenessUpdate(awareness, changedClients);
    channel.postMessage({
      type: 'update',
      update: update,
    } satisfies ChannelMessage);
  }

  function handleChannelMessage(event: MessageEvent<ChannelMessage>) {
    if (event.data.type === 'update') {
      const update = event.data.update;
      applyAwarenessUpdate(awareness, update, 'remote');
    }
    if (event.data.type === 'connect') {
      channel.postMessage({
        type: 'update',
        update: encodeAwarenessUpdate(awareness, [awareness.clientID]),
      } satisfies ChannelMessage);
    }
  }

  return {
    connect() {
      channel.postMessage({
        type: 'connect',
      } satisfies ChannelMessage);
      awareness.on('update', handleAwarenessUpdate);
      channel.addEventListener('message', handleChannelMessage);
    },
    disconnect() {
      awareness.off('update', handleAwarenessUpdate);
      channel.removeEventListener('message', handleChannelMessage);
    },
  };
}
