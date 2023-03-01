import { assertExists } from '@blocksuite/store';
import {
  applyAwarenessUpdate,
  Awareness,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness';

import { BlockSuiteWorkspace, BroadCastChannelProvider } from '../../../shared';
import {
  BroadcastChannelMessageEvent,
  getClients,
  TypedBroadcastChannel,
} from './type';

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
        const updateV2 = Y.encodeStateAsUpdateV2(doc, diff);
        broadcastChannel!.postMessage(['doc:update', updateV2, clientId]);
        break;
      }
      case 'doc:update': {
        const [, updateV2, clientId] = event.data;
        Y.applyUpdateV2(doc, updateV2, clientId);
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
        applyAwarenessUpdate(awareness, update, clientId);
        break;
      }
    }
  };
  return {
    flavour: 'broadcast-channel',
    connect: () => {
      assertExists(blockSuiteWorkspace.room);
      broadcastChannel = Object.assign(
        new BroadcastChannel(blockSuiteWorkspace.room),
        {
          onmessage: handleBroadcastChannelMessage,
        }
      );
      const docDiff = Y.encodeStateVector(doc);
      broadcastChannel.postMessage(['doc:diff', docDiff, awareness.clientID]);
      const docUpdateV2 = Y.encodeStateAsUpdateV2(doc);
      broadcastChannel.postMessage(['doc:update', docUpdateV2]);
      broadcastChannel.postMessage(['awareness:query', awareness.clientID]);
      const awarenessUpdate = encodeAwarenessUpdate(awareness, [
        awareness.clientID,
      ]);
      broadcastChannel.postMessage(['awareness:update', awarenessUpdate]);
      const handleDocUpdate = (updateV1: Uint8Array, origin: any) => {
        if (origin !== awareness.clientID) {
          // not self update, ignore
          return;
        }
        const updateV2 = Y.convertUpdateFormatV1ToV2(updateV1);
        broadcastChannel?.postMessage(['doc:update', updateV2]);
      };
      doc.on('update', handleDocUpdate);
    },
    disconnect: () => {
      assertExists(broadcastChannel);
      broadcastChannel.close();
    },
    cleanup: () => {
      assertExists(broadcastChannel);
      broadcastChannel.close();
    },
  };
};
