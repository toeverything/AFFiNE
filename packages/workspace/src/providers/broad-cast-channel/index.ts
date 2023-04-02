import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import type { Awareness } from 'y-protocols/awareness';
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness';

import type { BroadCastChannelProvider } from '../../type';
import { localProviderLogger } from '../logger';
import type {
  AwarenessChanges,
  BroadcastChannelMessageEvent,
  TypedBroadcastChannel,
} from './type';
import { getClients } from './type';

export const createBroadCastChannelProvider = (
  blockSuiteWorkspace: BlockSuiteWorkspace
): BroadCastChannelProvider => {
  const Y = BlockSuiteWorkspace.Y;
  const doc = blockSuiteWorkspace.doc;
  const awareness = blockSuiteWorkspace.awarenessStore
    .awareness as unknown as Awareness;
  let broadcastChannel: TypedBroadcastChannel | null = null;
  const handleBroadcastChannelMessage = (
    event: BroadcastChannelMessageEvent
  ) => {
    const [eventName] = event.data;
    switch (eventName) {
      case 'doc:diff': {
        const [, diff, clientId] = event.data;
        const update = Y.encodeStateAsUpdate(doc, diff);
        broadcastChannel!.postMessage(['doc:update', update, clientId]);
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
        broadcastChannel!.postMessage(['awareness:update', update, clientId]);
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
    background: false,
    connect: () => {
      assertExists(blockSuiteWorkspace.id);
      broadcastChannel = Object.assign(
        new BroadcastChannel(blockSuiteWorkspace.id),
        {
          onmessage: handleBroadcastChannelMessage,
        }
      );
      localProviderLogger.info(
        'connect broadcast channel',
        blockSuiteWorkspace.id
      );
      const docDiff = Y.encodeStateVector(doc);
      broadcastChannel.postMessage(['doc:diff', docDiff, awareness.clientID]);
      const docUpdateV2 = Y.encodeStateAsUpdate(doc);
      broadcastChannel.postMessage(['doc:update', docUpdateV2]);
      broadcastChannel.postMessage(['awareness:query', awareness.clientID]);
      const awarenessUpdate = encodeAwarenessUpdate(awareness, [
        awareness.clientID,
      ]);
      broadcastChannel.postMessage(['awareness:update', awarenessUpdate]);
      doc.on('update', handleDocUpdate);
      awareness.on('update', handleAwarenessUpdate);
    },
    disconnect: () => {
      assertExists(broadcastChannel);
      localProviderLogger.info(
        'disconnect broadcast channel',
        blockSuiteWorkspace.id
      );
      doc.off('update', handleDocUpdate);
      awareness.off('update', handleAwarenessUpdate);
      broadcastChannel.close();
    },
    cleanup: () => {
      assertExists(broadcastChannel);
      doc.off('update', handleDocUpdate);
      awareness.off('update', handleAwarenessUpdate);
      broadcastChannel.close();
    },
  };
};
