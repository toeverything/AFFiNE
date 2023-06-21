import type { BroadCastChannelProvider } from '@affine/env/workspace';
import type { DocProviderCreator } from '@blocksuite/store';
import { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness';
import type { Doc } from 'yjs';

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
  const docMap = new Map<string, Doc>();
  const updateHandlerWeakMap = new WeakMap<
    Doc,
    (updateV1: Uint8Array, origin: any) => void
  >();
  const handleBroadcastChannelMessage = (
    event: BroadcastChannelMessageEvent
  ) => {
    const [eventName] = event.data;
    switch (eventName) {
      case 'doc:diff': {
        const [, guid, diff, clientId] = event.data;
        const doc = docMap.get(guid) as Doc;
        const update = Y.encodeStateAsUpdate(doc, diff);
        broadcastChannel?.postMessage(['doc:update', guid, update, clientId]);
        break;
      }
      case 'doc:update': {
        const [, guid, update, clientId] = event.data;
        const doc = docMap.get(guid) as Doc;
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

  const createOrGetHandleWeakMap = (doc: Doc) => {
    if (updateHandlerWeakMap.has(doc)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      return updateHandlerWeakMap.get(doc)!;
    }
    const handleDocUpdate = (updateV1: Uint8Array, origin: any) => {
      if (origin === broadcastChannel) {
        // not self update, ignore
        return;
      }
      broadcastChannel?.postMessage(['doc:update', doc.guid, updateV1]);
    };
    updateHandlerWeakMap.set(doc, handleDocUpdate);
    return handleDocUpdate;
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

  function setMap(doc: Doc) {
    docMap.set(doc.guid, doc);
    doc.subdocs.forEach(setMap);
  }

  function clearMap() {
    docMap.clear();
  }

  type SubDocsEvent = {
    added: Set<Doc>;
    removed: Set<Doc>;
    loaded: Set<Doc>;
  };

  function handleSubDoc(event: SubDocsEvent) {
    event.loaded.forEach(handleDocOn);
  }

  function handleDocOn(doc: Doc) {
    doc.on('update', createOrGetHandleWeakMap(doc));
    doc.on('subdocs', handleSubDoc);
    doc.subdocs.forEach(handleDocOn);
  }

  function handleDocOff(doc: Doc) {
    doc.off('update', createOrGetHandleWeakMap(doc));
    doc.off('subdocs', handleSubDoc);
    doc.subdocs.forEach(handleDocOff);
  }

  return {
    flavour: 'broadcast-channel',
    passive: true,
    get connected() {
      return callbacks.ready;
    },
    connect: () => {
      assertExists(id);
      setMap(doc);
      broadcastChannel = Object.assign(new BroadcastChannel(id), {
        onmessage: handleBroadcastChannelMessage,
      });
      localProviderLogger.info('connect broadcast channel', id);
      function initPostMessage(doc: Doc) {
        assertExists(broadcastChannel);
        assertExists(awareness);
        const docDiff = Y.encodeStateVector(doc);
        broadcastChannel.postMessage([
          'doc:diff',
          doc.guid,
          docDiff,
          awareness.clientID,
        ]);
        const docUpdate = Y.encodeStateAsUpdate(doc);
        broadcastChannel.postMessage(['doc:update', doc.guid, docUpdate]);
        doc.subdocs.forEach(initPostMessage);
      }
      initPostMessage(doc);
      broadcastChannel.postMessage(['awareness:query', awareness.clientID]);
      const awarenessUpdate = encodeAwarenessUpdate(awareness, [
        awareness.clientID,
      ]);
      broadcastChannel.postMessage(['awareness:update', awarenessUpdate]);
      handleDocOn(doc);
      awareness.on('update', handleAwarenessUpdate);
      callbacks.ready = true;
    },
    disconnect: () => {
      assertExists(broadcastChannel);
      clearMap();
      localProviderLogger.info('disconnect broadcast channel', id);
      handleDocOff(doc);
      awareness.off('update', handleAwarenessUpdate);
      broadcastChannel.close();
      callbacks.ready = false;
    },
    cleanup: () => {
      assertExists(broadcastChannel);
      doc.off('update', createOrGetHandleWeakMap(doc));
      awareness.off('update', handleAwarenessUpdate);
      broadcastChannel.close();
    },
  };
};
