import type { StoreExtensionManager } from '@blocksuite/affine/ext-loader';
import { AffineSchemas } from '@blocksuite/affine/schemas';
import { nanoid, Schema, Transformer } from '@blocksuite/affine/store';
import {
  createAutoIncrementIdGenerator,
  type DocCollectionOptions,
  TestWorkspace,
} from '@blocksuite/affine/store/test';
import {
  type AwarenessSource,
  type BlobSource,
  BroadcastChannelAwarenessSource,
  BroadcastChannelDocSource,
  IndexedDBBlobSource,
  MemoryBlobSource,
} from '@blocksuite/affine/sync';
import * as Y from 'yjs';

import { MockServerBlobSource } from '../../_common/sync/blob/mock-server.js';
import {
  hasUsablePageRoot,
  initRoomDocWithSeed,
  reusePartialSeedDoc,
  RoomWebSocketClient,
} from '../../_common/sync/room/index.js';
import type { InitFn } from '../data/utils.js';

const params = new URLSearchParams(location.search);
const room = params.get('room');
const wsParam = params.get('ws');
const envRelayUrl =
  (import.meta as { env?: Record<string, string | undefined> }).env
    ?.PLAYGROUND_RELAY_URL ?? null;
const explicitRelayWs = wsParam || envRelayUrl;
const isE2E = room?.startsWith('playwright');
const blobSourceArgs = (params.get('blobSource') ?? '').split(',');
const roomClients = new WeakMap<TestWorkspace, RoomWebSocketClient>();

function resolveRoomWsUrl(roomName: string, explicitWs: string | null) {
  if (explicitWs) {
    return explicitWs;
  }
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}/native-sync/rooms/${encodeURIComponent(roomName)}`;
}

function resolveRelayHttpOrigin(explicitWs: string | null): string {
  if (!explicitWs) {
    return '';
  }
  try {
    const parsed = new URL(explicitWs);
    if (parsed.protocol === 'ws:' || parsed.protocol === 'wss:') {
      const httpProto = parsed.protocol === 'wss:' ? 'https:' : 'http:';
      return `${httpProto}//${parsed.host}`;
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return `${parsed.protocol}//${parsed.host}`;
    }
  } catch {
    // Fall back to relative origin if the override is not a full URL.
  }
  return '';
}

export function createStarterDocCollection(
  storeExtensionManager: StoreExtensionManager
) {
  const collectionId = room ?? 'starter';
  const schema = new Schema();
  schema.register(AffineSchemas);
  const idGenerator = isE2E ? createAutoIncrementIdGenerator() : nanoid;

  const useRoomWs = Boolean(explicitRelayWs || (room && !isE2E));
  const id = room ?? `starter-${Math.random().toString(16).slice(2, 8)}`;

  let docSources: DocCollectionOptions['docSources'];
  let roomClient: RoomWebSocketClient | null = null;
  const awarenessSources: AwarenessSource[] = [
    new BroadcastChannelAwarenessSource(id),
  ];

  if (useRoomWs) {
    roomClient = new RoomWebSocketClient(
      resolveRoomWsUrl(collectionId, explicitRelayWs)
    );
    docSources = {
      main: roomClient.createDocSource(),
      shadows: [
        new BroadcastChannelDocSource(`broadcast-channel-${collectionId}`),
      ],
    };
    awarenessSources.push(roomClient.createAwarenessSource());
  } else if (room) {
    docSources = {
      main: new BroadcastChannelDocSource(`broadcast-channel-${room}`),
    };
  }

  const blobSources = {
    main: new MemoryBlobSource(),
    shadows: [] as BlobSource[],
  } satisfies DocCollectionOptions['blobSources'];
  if (useRoomWs || blobSourceArgs.includes('mock')) {
    const relayHttpOrigin = resolveRelayHttpOrigin(explicitRelayWs);
    blobSources.shadows.push(
      new MockServerBlobSource(collectionId, relayHttpOrigin)
    );
  }
  if (blobSourceArgs.includes('idb')) {
    blobSources.shadows.push(new IndexedDBBlobSource(collectionId));
  }

  const options: DocCollectionOptions = {
    id: collectionId,
    idGenerator,
    awarenessSources,
    docSources,
    blobSources,
  };
  const collection = new TestWorkspace(options);
  if (roomClient) {
    roomClients.set(collection, roomClient);
  }
  collection.storeExtensions = storeExtensionManager.get('store');
  collection.start();

  // debug info
  window.collection = collection;
  window.blockSchemas = AffineSchemas;
  window.job = new Transformer({
    schema,
    blobCRUD: collection.blobSync,
    docCRUD: {
      create: (id: string) => collection.createDoc(id).getStore({ id }),
      get: (id: string) => collection.getDoc(id)?.getStore({ id }) ?? null,
      delete: (id: string) => collection.removeDoc(id),
    },
  });
  window.Y = Y;

  return collection;
}

export async function initStarterDocCollection(collection: TestWorkspace) {
  // use built-in init function
  const functionMap = new Map<
    string,
    (collection: TestWorkspace, id: string) => Promise<void> | void
  >();
  Object.values(
    (await import('../data/index.js')) as Record<string, InitFn>
  ).forEach(fn => functionMap.set(fn.id, fn));
  const init = params.get('init') || 'preset';
  if (functionMap.has(init)) {
    const initFn = functionMap.get(init);
    const roomClient = roomClients.get(collection);
    if (roomClient) {
      await initRoomDocWithSeed({
        collection,
        roomClient,
        docId: 'doc:home',
        seedKey: 'seed:doc:home',
        seed: async () => {
          // If a previous winner pushed meta.pages for doc:home and disconnected
          // before seeding doc:home's blocks, populate the existing doc:home in place.
          const existing = collection.getDoc('doc:home');
          const seedCollection =
            existing && !hasUsablePageRoot(existing)
              ? reusePartialSeedDoc(collection, 'doc:home', existing)
              : collection;
          await initFn?.(seedCollection, 'doc:home');
        },
        allowOfflineFallback: !explicitRelayWs,
        onOfflineFallback: () => {
          collection.forceStop();
        },
      });
      return;
    }

    collection.meta.initialize();
    await initFn?.(collection, 'doc:home');
    const doc = collection.getDoc('doc:home');
    if (!doc?.loaded) {
      doc?.load();
    }
  }
}
