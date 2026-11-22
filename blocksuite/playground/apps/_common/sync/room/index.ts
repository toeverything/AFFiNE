import type { AwarenessSource, DocSource } from '@blocksuite/sync';
import type { Awareness } from 'y-protocols/awareness';
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';

const FRAME_TAG_DOC = 0x00;
const FRAME_TAG_AWARENESS = 0x01;
const SYNC_MSG_DOC = 0;
const ROOM_AWARENESS_ORIGIN = 'room';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function pushVarUint(out: number[], value: number) {
  let num = value;
  while (num > 0x7f) {
    out.push(0x80 | (num & 0x7f));
    num = Math.floor(num / 128);
  }
  out.push(num & 0x7f);
}

function pushVarBytes(out: number[], bytes: Uint8Array) {
  pushVarUint(out, bytes.byteLength);
  for (let i = 0; i < bytes.byteLength; i += 1) {
    out.push(bytes[i]!);
  }
}

function pushVarString(out: number[], value: string) {
  pushVarBytes(out, textEncoder.encode(value));
}

function readVarUint(
  bytes: Uint8Array,
  cursor: { offset: number }
): number | null {
  let num = 0;
  let mult = 1;
  while (cursor.offset < bytes.byteLength) {
    const byte = bytes[cursor.offset]!;
    cursor.offset += 1;
    num += (byte & 0x7f) * mult;
    if (byte < 0x80) {
      return num;
    }
    mult *= 128;
  }
  return null;
}

function readVarBytes(
  bytes: Uint8Array,
  cursor: { offset: number }
): Uint8Array | null {
  const len = readVarUint(bytes, cursor);
  if (len === null || cursor.offset + len > bytes.byteLength) {
    return null;
  }
  const slice = bytes.subarray(cursor.offset, cursor.offset + len);
  cursor.offset += len;
  return slice;
}

export type RoomControlFrame =
  | { type: 'seed-claim'; key: string }
  | { type: 'seed-claim-result'; key: string; winner: boolean }
  | { type: 'ready'; docId: string };

function encodeRoomDocFrame(
  docId: string,
  step: number,
  payload: Uint8Array
): Uint8Array {
  const out: number[] = [FRAME_TAG_DOC];
  pushVarString(out, docId);
  pushVarUint(out, SYNC_MSG_DOC);
  pushVarUint(out, step);
  pushVarBytes(out, payload);
  return new Uint8Array(out);
}

export function encodeRoomDocStep1(
  docId: string,
  stateVector: Uint8Array
): Uint8Array {
  return encodeRoomDocFrame(
    docId,
    syncProtocol.messageYjsSyncStep1,
    stateVector
  );
}

export function encodeRoomDocStep2(
  docId: string,
  diff: Uint8Array
): Uint8Array {
  return encodeRoomDocFrame(docId, syncProtocol.messageYjsSyncStep2, diff);
}

export function encodeRoomDocUpdate(
  docId: string,
  update: Uint8Array
): Uint8Array {
  return encodeRoomDocFrame(docId, syncProtocol.messageYjsUpdate, update);
}

export function encodeRoomAwarenessFrame(payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(1 + payload.byteLength);
  out[0] = FRAME_TAG_AWARENESS;
  out.set(payload, 1);
  return out;
}

type DecodedRoomBinaryFrame =
  | {
      kind: 'doc';
      docId: string;
      step: number;
      payload: Uint8Array;
    }
  | {
      kind: 'awareness';
      payload: Uint8Array;
    };

function decodeRoomBinaryFrame(
  bytes: Uint8Array
): DecodedRoomBinaryFrame | null {
  if (bytes.byteLength === 0) return null;
  const tag = bytes[0];
  if (tag === FRAME_TAG_AWARENESS) {
    return {
      kind: 'awareness',
      payload: bytes.subarray(1),
    };
  }
  if (tag === FRAME_TAG_DOC) {
    const cursor = { offset: 1 };
    const docIdBytes = readVarBytes(bytes, cursor);
    if (!docIdBytes) return null;
    const docId = textDecoder.decode(docIdBytes);
    const outerType = readVarUint(bytes, cursor);
    if (outerType !== SYNC_MSG_DOC) {
      return null;
    }
    const step = readVarUint(bytes, cursor);
    if (step === null) return null;
    const payload = readVarBytes(bytes, cursor);
    if (!payload) return null;
    return { kind: 'doc', docId, step, payload };
  }
  return null;
}

interface PendingPull {
  step2?: Uint8Array;
  hubSv?: Uint8Array;
  resolve: (value: { data: Uint8Array; state: Uint8Array }) => void;
  reject: (err: Error) => void;
}

interface PendingSeedClaim {
  resolve: (winner: boolean) => void;
  reject: (err: Error) => void;
}

export interface RoomWebSocketClientOptions {
  /** Optional hook called whenever a doc update or reverse step2 is sent. */
  onOutboundDocFrame?: (
    docId: string,
    kind: 'step2' | 'update',
    bytes: Uint8Array
  ) => void;
}

export class RoomWebSocketClient {
  private _ws: WebSocket | null = null;
  private _openPromise: Promise<WebSocket> | null = null;
  private _closed = false;
  private _hasOpenedOnce = false;

  private readonly _pendingPulls = new Map<string, PendingPull>();
  private readonly _pendingSeedClaims = new Map<string, PendingSeedClaim[]>();
  private readonly _docSubscribers = new Set<
    (docId: string, data: Uint8Array) => void
  >();
  private readonly _disconnectListeners = new Set<(reason: string) => void>();
  private readonly _reconnectListeners = new Set<() => void>();
  private readonly _awarenessListeners = new Set<
    (payload: Uint8Array) => void
  >();

  constructor(
    readonly url: string,
    private readonly _options: RoomWebSocketClientOptions = {}
  ) {}

  async ensureConnected(): Promise<void> {
    await this._ensureSocket();
  }

  private _ensureSocket(): Promise<WebSocket> {
    if (this._closed) {
      return Promise.reject(new Error('RoomWebSocketClient is closed'));
    }
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      return Promise.resolve(this._ws);
    }
    if (this._openPromise) {
      return this._openPromise;
    }

    this._openPromise = new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(this.url);
      ws.binaryType = 'arraybuffer';
      this._ws = ws;

      const onOpen = () => {
        ws.removeEventListener('error', onOpenError);
        const isReconnect = this._hasOpenedOnce;
        this._hasOpenedOnce = true;
        resolve(ws);
        if (isReconnect) {
          for (const cb of this._reconnectListeners) {
            cb();
          }
        }
      };
      const onOpenError = () => {
        ws.removeEventListener('open', onOpen);
        this._openPromise = null;
        if (this._ws === ws) {
          this._ws = null;
        }
        const err = new Error(`WebSocket connection failed: ${this.url}`);
        this._rejectAllPending(err);
        reject(err);
      };

      ws.addEventListener('open', onOpen, { once: true });
      ws.addEventListener('error', onOpenError, { once: true });
      ws.addEventListener('message', event => {
        this._handleMessage(event.data).catch(() => {});
      });
      ws.addEventListener('close', event => {
        if (this._ws === ws) {
          this._ws = null;
          this._openPromise = null;
        }
        const reason = event.reason || `code:${event.code}`;
        this._rejectAllPending(new Error(`WebSocket closed (${reason})`));
        for (const cb of this._disconnectListeners) {
          cb(reason);
        }
      });
    });

    return this._openPromise;
  }

  private _rejectAllPending(err: Error) {
    for (const [, pending] of this._pendingPulls) {
      pending.reject(err);
    }
    this._pendingPulls.clear();

    for (const [, list] of this._pendingSeedClaims) {
      for (const item of list) {
        item.reject(err);
      }
    }
    this._pendingSeedClaims.clear();
  }

  private async _handleMessage(raw: unknown) {
    if (typeof raw === 'string') {
      try {
        const frame = JSON.parse(raw) as RoomControlFrame;
        if (frame.type === 'seed-claim-result') {
          const list = this._pendingSeedClaims.get(frame.key);
          const first = list?.shift();
          if (list && list.length === 0) {
            this._pendingSeedClaims.delete(frame.key);
          }
          first?.resolve(frame.winner);
        }
      } catch {
        // Ignore malformed control frames.
      }
      return;
    }

    let bytes: Uint8Array;
    if (raw instanceof ArrayBuffer) {
      bytes = new Uint8Array(raw);
    } else if (ArrayBuffer.isView(raw)) {
      bytes = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    } else if (typeof Blob !== 'undefined' && raw instanceof Blob) {
      bytes = new Uint8Array(await raw.arrayBuffer());
    } else {
      return;
    }

    const decoded = decodeRoomBinaryFrame(bytes);
    if (!decoded) return;

    if (decoded.kind === 'awareness') {
      for (const listener of this._awarenessListeners) {
        listener(decoded.payload);
      }
      return;
    }

    const { docId, step, payload } = decoded;
    if (step === syncProtocol.messageYjsSyncStep2) {
      const pending = this._pendingPulls.get(docId);
      if (pending) {
        pending.step2 = payload;
        if (pending.hubSv) {
          this._pendingPulls.delete(docId);
          pending.resolve({ data: pending.step2, state: pending.hubSv });
        }
      } else {
        for (const cb of this._docSubscribers) {
          cb(docId, payload);
        }
      }
    } else if (step === syncProtocol.messageYjsSyncStep1) {
      const pending = this._pendingPulls.get(docId);
      if (pending) {
        pending.hubSv = payload;
        if (pending.step2) {
          this._pendingPulls.delete(docId);
          pending.resolve({ data: pending.step2, state: pending.hubSv });
        }
      }
    } else if (step === syncProtocol.messageYjsUpdate) {
      for (const cb of this._docSubscribers) {
        cb(docId, payload);
      }
    }
  }

  async sendBinary(bytes: Uint8Array): Promise<void> {
    const ws = await this._ensureSocket();
    if (ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    ws.send(bytes.slice());
  }

  async claimSeed(key: string): Promise<boolean> {
    const ws = await this._ensureSocket();
    return new Promise<boolean>((resolve, reject) => {
      const list = this._pendingSeedClaims.get(key) ?? [];
      list.push({ resolve, reject });
      this._pendingSeedClaims.set(key, list);
      ws.send(
        JSON.stringify({ type: 'seed-claim', key } satisfies RoomControlFrame)
      );
    });
  }

  /** Force-drop the current socket (useful for reconnect testing) without permanently closing the client. */
  dropConnection() {
    if (this._ws) {
      this._ws.close(4000, 'simulated-disconnect');
      this._ws = null;
      this._openPromise = null;
    }
  }

  close() {
    this._closed = true;
    this._rejectAllPending(new Error('RoomWebSocketClient closed'));
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._openPromise = null;
  }

  createDocSource(): DocSource {
    return {
      name: 'room-websocket',
      pull: async (docId: string, state: Uint8Array) => {
        const ws = await this._ensureSocket();
        return new Promise<{ data: Uint8Array; state: Uint8Array }>(
          (resolve, reject) => {
            const existing = this._pendingPulls.get(docId);
            if (existing) {
              existing.reject(new Error(`Superseded pull for ${docId}`));
            }
            this._pendingPulls.set(docId, { resolve, reject });
            ws.send(encodeRoomDocStep1(docId, state).slice());
          }
        );
      },
      finishPull: async (docId: string, diffToStorage: Uint8Array) => {
        this._options.onOutboundDocFrame?.(docId, 'step2', diffToStorage);
        await this.sendBinary(encodeRoomDocStep2(docId, diffToStorage));
      },
      push: async (docId: string, data: Uint8Array) => {
        this._options.onOutboundDocFrame?.(docId, 'update', data);
        await this.sendBinary(encodeRoomDocUpdate(docId, data));
      },
      subscribe: async (cb, disconnect) => {
        await this._ensureSocket();
        this._docSubscribers.add(cb);
        this._disconnectListeners.add(disconnect);
        return () => {
          this._docSubscribers.delete(cb);
          this._disconnectListeners.delete(disconnect);
        };
      },
    };
  }

  createAwarenessSource(): AwarenessSource {
    let connectedAwareness: Awareness | null = null;
    let onLocalUpdate:
      | ((
          changes: { added: number[]; updated: number[]; removed: number[] },
          origin: unknown
        ) => void)
      | null = null;
    let onRemotePayload: ((payload: Uint8Array) => void) | null = null;
    let onReconnect: (() => void) | null = null;

    return {
      connect: (awareness: Awareness) => {
        connectedAwareness = awareness;

        onLocalUpdate = (changes, origin) => {
          if (origin === ROOM_AWARENESS_ORIGIN) return;
          const changedClients = [
            ...changes.added,
            ...changes.updated,
            ...changes.removed,
          ];
          if (changedClients.length === 0) return;
          const encoded = encodeAwarenessUpdate(awareness, changedClients);
          void this.sendBinary(encodeRoomAwarenessFrame(encoded)).catch(
            () => {}
          );
        };

        onRemotePayload = (payload: Uint8Array) => {
          applyAwarenessUpdate(awareness, payload, ROOM_AWARENESS_ORIGIN);
        };

        onReconnect = () => {
          if (!connectedAwareness) return;
          const cur = connectedAwareness.getLocalState();
          if (cur !== null) {
            // Bump local awareness clock by >= +2 so it strictly exceeds the hub's
            // disconnect tombstone (old_clock + 1) and restores live cursor presence.
            connectedAwareness.setLocalState({ ...cur });
            connectedAwareness.setLocalState(cur);
          }
        };

        awareness.on('update', onLocalUpdate);
        this._awarenessListeners.add(onRemotePayload);
        this._reconnectListeners.add(onReconnect);

        // Broadcast current local awareness state once socket is open.
        if (awareness.meta.has(awareness.clientID)) {
          const initial = encodeAwarenessUpdate(awareness, [
            awareness.clientID,
          ]);
          void this.sendBinary(encodeRoomAwarenessFrame(initial)).catch(
            () => {}
          );
        }
      },
      disconnect: () => {
        // Never close the shared WebSocket here — only detach awareness listeners.
        // Remove awareness state BEFORE detaching onLocalUpdate so explicit disconnect
        // broadcasts the removal frame to live peers.
        if (connectedAwareness && onLocalUpdate) {
          removeAwarenessStates(
            connectedAwareness,
            [connectedAwareness.clientID],
            'disconnect'
          );
          connectedAwareness.off('update', onLocalUpdate);
        }
        if (onRemotePayload) {
          this._awarenessListeners.delete(onRemotePayload);
        }
        if (onReconnect) {
          this._reconnectListeners.delete(onReconnect);
        }
        connectedAwareness = null;
        onLocalUpdate = null;
        onRemotePayload = null;
        onReconnect = null;
      },
    };
  }
}

export interface RoomSeedDocHandle {
  loaded: boolean;
  load(): unknown;
  spaceDoc?: {
    getMap(name: string): {
      values(): Iterable<unknown>;
    };
    on?(event: 'update', cb: () => void): void;
    off?(event: 'update', cb: () => void): void;
  };
}

export interface RoomSeedCollection {
  getDoc(id: string): RoomSeedDocHandle | null;
  waitForSynced(): Promise<unknown>;
  meta: {
    initialize(): void;
    docMetaAdded: {
      subscribe(cb: (docId: string) => void): { unsubscribe(): void };
    };
  };
}

export interface InitRoomDocWithSeedOptions {
  collection: RoomSeedCollection;
  roomClient: RoomWebSocketClient;
  docId: string;
  seedKey: string;
  seed: () => Promise<void> | void;
  /**
   * When true, fall back to a detached local standalone seed ONLY if the initial
   * WebSocket connection itself fails (e.g. `bs-relay` is not running).
   */
  allowOfflineFallback?: boolean;
  /** Invoked when initial socket connection fails and offline fallback is taken. */
  onOfflineFallback?: () => void;
}

export function hasUsablePageRoot(doc: RoomSeedDocHandle | null): boolean {
  if (!doc?.spaceDoc) return false;
  const blocks = doc.spaceDoc.getMap('blocks');
  for (const value of blocks.values()) {
    if (
      value &&
      typeof value === 'object' &&
      'get' in value &&
      typeof (value as { get: unknown }).get === 'function' &&
      (value as { get(k: string): unknown }).get('sys:flavour') ===
        'affine:page'
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Collection view for seeding a document that already exists without a page root (a
 * previous seed winner pushed its `meta.pages` entry and left before adding blocks).
 *
 * Initializers start with `collection.getDoc(id) ?? collection.createDoc(id)` and then
 * either branch on "did the doc exist" or populate it inside `doc.load(() => { ... })`.
 * Through this view the first `getDoc(docId)` answers `null` and `createDoc(docId)` hands
 * back the existing doc, so the initializer fills it in place; `removeDoc` is never
 * needed, which would destroy `spaces[docId]` on the other peers. The doc handed back
 * runs the first `load` callback it is given once, even though the underlying doc has
 * been loaded already.
 */
export function reusePartialSeedDoc<
  Doc extends { load(initFn?: () => void): unknown },
  Collection extends {
    getDoc(id: string): Doc | null;
    createDoc(id?: string): Doc;
  },
>(collection: Collection, docId: string, existing: Doc): Collection {
  let claimed = false;
  let initialized = false;
  const seedDoc: Doc = new Proxy(existing, {
    get(target, prop) {
      if (prop === 'load') {
        return (initFn?: () => void) => {
          target.load();
          // A bare `load()` leaves the initializer for the `load(initFn)` that follows.
          if (initFn && !initialized) {
            initialized = true;
            initFn();
          }
          return seedDoc;
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return new Proxy(collection, {
    get(target, prop) {
      if (prop === 'getDoc') {
        return (id: string) => {
          if (id === docId) {
            return claimed ? seedDoc : null;
          }
          return target.getDoc(id);
        };
      }
      if (prop === 'createDoc') {
        return (id?: string) => {
          if (id === docId) {
            claimed = true;
            return seedDoc;
          }
          return target.createDoc(id);
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

async function waitForUsablePageRoot(doc: RoomSeedDocHandle): Promise<void> {
  if (hasUsablePageRoot(doc)) return;
  const spaceDoc = doc.spaceDoc;
  if (!spaceDoc?.on || !spaceDoc.off) return;

  await new Promise<void>(resolve => {
    const onUpdate = () => {
      if (hasUsablePageRoot(doc)) {
        spaceDoc.off?.('update', onUpdate);
        resolve();
      }
    };
    spaceDoc.on?.('update', onUpdate);
    if (hasUsablePageRoot(doc)) {
      spaceDoc.off?.('update', onUpdate);
      resolve();
    }
  });
}

async function waitForDocArrival(
  collection: RoomSeedCollection,
  docId: string
): Promise<RoomSeedDocHandle> {
  const existing = collection.getDoc(docId);
  if (existing) return existing;

  return new Promise<RoomSeedDocHandle>(resolve => {
    let settled = false;
    const finish = (doc: RoomSeedDocHandle) => {
      if (settled) return;
      settled = true;
      sub.unsubscribe();
      resolve(doc);
    };

    const sub = collection.meta.docMetaAdded.subscribe(addedId => {
      if (addedId === docId) {
        const arrived = collection.getDoc(docId);
        if (arrived) {
          finish(arrived);
        }
      }
    });

    // Re-check immediately in case doc arrived between initial check and subscribe.
    const now = collection.getDoc(docId);
    if (now) {
      finish(now);
    }
  });
}

/**
 * Coordinate initial document seeding across peers in a room using WebSocket
 * `seed-claim` / `seed-claim-result` CAS arbitration.
 *
 * - Falls back to a detached offline standalone workspace ONLY when the initial
 *   WebSocket connection itself fails (`allowOfflineFallback: true`).
 * - Once connected, waits for initial sync (never timing out into local seeding).
 * - If `docId` already exists with a usable `affine:page` root, loads it without re-seeding.
 * - Otherwise claims `seedKey` over WebSocket: only the single winner seeds `docId`
 *   (and must leave it with an `affine:page` root, or this rejects), while non-winners
 *   wait for `docId` to arrive and load it.
 */
export async function initRoomDocWithSeed({
  collection,
  roomClient,
  docId,
  seedKey,
  seed,
  allowOfflineFallback = false,
  onOfflineFallback,
}: InitRoomDocWithSeedOptions): Promise<{
  seeded: boolean;
  offlineFallback: boolean;
}> {
  try {
    await roomClient.ensureConnected();
  } catch (err) {
    if (allowOfflineFallback) {
      // Permanently close the room client so an offline seed is never pushed into a live room later.
      roomClient.close();
      onOfflineFallback?.();
      collection.meta.initialize();
      await seed();
      const doc = collection.getDoc(docId);
      if (doc && !doc.loaded) {
        doc.load();
      }
      return { seeded: true, offlineFallback: true };
    }
    throw err;
  }

  await collection.waitForSynced();

  const existing = collection.getDoc(docId);
  if (existing) {
    if (!existing.loaded) {
      existing.load();
    }
    await collection.waitForSynced();
    if (hasUsablePageRoot(existing)) {
      return { seeded: false, offlineFallback: false };
    }
  }

  const winner = await roomClient.claimSeed(seedKey);
  if (winner) {
    collection.meta.initialize();
    await seed();
    const doc = collection.getDoc(docId);
    if (doc && !doc.loaded) {
      doc.load();
    }
    // The winner is the only peer that seeds: the waiters block on this page root.
    if (!hasUsablePageRoot(doc)) {
      throw new Error(
        `Seeding "${docId}" finished without an affine:page root block`
      );
    }
    await collection.waitForSynced();
    return { seeded: true, offlineFallback: false };
  }

  const arrived = await waitForDocArrival(collection, docId);
  if (!arrived.loaded) {
    arrived.load();
  }
  await collection.waitForSynced();
  if (arrived.spaceDoc && !hasUsablePageRoot(arrived)) {
    await waitForUsablePageRoot(arrived);
    await collection.waitForSynced();
  }
  return { seeded: false, offlineFallback: false };
}
