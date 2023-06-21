import type { BroadCastChannelProvider } from '@affine/env/workspace';
import type { DocProviderCreator } from '@blocksuite/store';
import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness';

import { CallbackSet } from '../../utils';
import { localProviderLogger } from '../logger';
import type {
  AwarenessChanges,
  BroadcastChannelMessageEvent,
  TypedBroadcastChannel,
} from './type';
import { getClients } from './type';

export const createBroadCastChannelProvider: DocProviderCreator = (
  id,
  doc,
  { awareness } = {}
): BroadCastChannelProvider => {
  if (!awareness) {
    console.warn('awareness not found');
    throw new Error();
  }
  const Y = BlockSuiteWorkspace.Y;
  let broadcastChannel: TypedBroadcastChannel | null = null;
  const callbacks = new CallbackSet();
  const handleBroadcastChannelMessage = (
    event: BroadcastChannelMessageEvent
  ) => {
    const [eventName] = event.data;
    switch (eventName) {
      case 'doc:diff': {
        const [, diff, clientId] = event.data;
        const update = Y.encodeStateAsUpdate(doc, diff);
        broadcastChannel?.postMessage(['doc:update', update, clientId]);
        break;
      }
      case 'doc:update': {
        const [, update, clientId] = event.data;
        if (!clientId || clientId === awareness.clientID) {
          Y.applyUpdate(doc, update, broadcastChannel);
        }
        break;
      }
      case 'awareness:query': {
        const [, clientId] = event.data;
        const clients = getClients(awareness);
        const update = encodeAwarenessUpdate(awareness, clients);
        broadcastChannel?.postMessage(['awareness:update', update, clientId]);
        break;
      }
      case 'awareness:update': {
        const [, update, clientId] = event.data;
        if (!clientId || clientId === awareness.clientID) {
          applyAwarenessUpdate(awareness, update, broadcastChannel);
        }
        break;
      }
    }
    if (callbacks.ready) {
      callbacks.forEach(cb => cb());
    }
  };
  const handleDocUpdate = (updateV1: Uint8Array, origin: any) => {
    if (origin === broadcastChannel) {
      // not self update, ignore
      return;
    }
    broadcastChannel?.postMessage(['doc:update', updateV1]);
  };
  const handleAwarenessUpdate = (changes: AwarenessChanges, origin: any) => {
    if (origin === broadcastChannel) {
      return;
    }
    const changedClients = Object.values(changes).reduce((res, cur) => [
      ...res,
      ...cur,
    ]);
    const update = encodeAwarenessUpdate(awareness, changedClients);
    broadcastChannel?.postMessage(['awareness:update', update]);
  };
  return {
    flavour: 'broadcast-channel',
    passive: true,
    get connected() {
      return callbacks.ready;
    },
    connect: () => {
      assertExists(id);
      broadcastChannel = Object.assign(new BroadcastChannel(id), {
        onmessage: handleBroadcastChannelMessage,
      });
      localProviderLogger.info('connect broadcast channel', id);
      const docDiff = Y.encodeStateVector(doc);
      broadcastChannel.postMessage(['doc:diff', docDiff, awareness.clientID]);
      const docUpdate = Y.encodeStateAsUpdate(doc);
      broadcastChannel.postMessage(['doc:update', docUpdate]);
      broadcastChannel.postMessage(['awareness:query', awareness.clientID]);
      const awarenessUpdate = encodeAwarenessUpdate(awareness, [
        awareness.clientID,
      ]);
      broadcastChannel.postMessage(['awareness:update', awarenessUpdate]);
      doc.on('update', handleDocUpdate);
      awareness.on('update', handleAwarenessUpdate);
      callbacks.ready = true;
    },
    disconnect: () => {
      assertExists(broadcastChannel);
      localProviderLogger.info('disconnect broadcast channel', id);
      doc.off('update', handleDocUpdate);
      awareness.off('update', handleAwarenessUpdate);
      broadcastChannel.close();
      callbacks.ready = false;
    },
    cleanup: () => {
      assertExists(broadcastChannel);
      doc.off('update', handleDocUpdate);
      awareness.off('update', handleAwarenessUpdate);
      broadcastChannel.close();
    },
  };
};
