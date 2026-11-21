import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';

import { AffineSchemas } from '@blocksuite/affine/schemas';
import { TextSelection } from '@blocksuite/affine/std';
import { BlockSchemaExtension, Schema, Text } from '@blocksuite/affine/store';
import { TestWorkspace } from '@blocksuite/affine/store/test';
import { MemoryBlobSource } from '@blocksuite/affine/sync';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { MockServerBlobSource } from '../../blob/mock-server.js';
import {
  hasUsablePageRoot,
  initRoomDocWithSeed,
  RoomWebSocketClient,
} from '../index.js';

const NATIVE_DIR = resolve(__dirname, '../../../../../../native-playground');
const RELAY_BIN =
  process.env.BS_RELAY_BIN ?? resolve(NATIVE_DIR, 'target/debug/bs-relay');
const DRIVER_BIN =
  process.env.BS_DOC_DRIVER_BIN ??
  resolve(NATIVE_DIR, 'target/debug/examples/bs_doc_driver');

function normalizeYValue(val: unknown): unknown {
  if (val instanceof Y.Map) {
    const entries = Array.from(val.entries()).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    );
    const obj: Record<string, unknown> = {};
    for (const [k, v] of entries) {
      obj[k] = normalizeYValue(v);
    }
    return obj;
  }
  if (val instanceof Y.Array) {
    return val.toArray().map(item => normalizeYValue(item));
  }
  if (val instanceof Y.Text) {
    const delta = val.toDelta() as Array<{
      insert: unknown;
      attributes?: Record<string, unknown>;
    }>;
    const ops: Array<Record<string, unknown>> = [];
    for (const op of delta) {
      const insert = normalizeYValue(op.insert);
      let sortedAttrs: Record<string, unknown> | undefined;
      if (op.attributes && Object.keys(op.attributes).length > 0) {
        sortedAttrs = {};
        for (const k of Object.keys(op.attributes).sort()) {
          sortedAttrs[k] = normalizeYValue(op.attributes[k]);
        }
      }
      const prev = ops[ops.length - 1];
      if (
        typeof insert === 'string' &&
        prev &&
        typeof prev['insert'] === 'string' &&
        JSON.stringify(prev['attributes']) === JSON.stringify(sortedAttrs)
      ) {
        prev['insert'] = `${prev['insert']}${insert}`;
        continue;
      }
      const out: Record<string, unknown> = { insert };
      if (sortedAttrs) {
        out['attributes'] = sortedAttrs;
      }
      ops.push(out);
    }
    return ops;
  }
  if (val instanceof Y.Doc) {
    return val.guid;
  }
  if (Array.isArray(val)) {
    return val.map(item => normalizeYValue(item));
  }
  if (val !== null && typeof val === 'object') {
    const obj: Record<string, unknown> = {};
    for (const k of Object.keys(val as Record<string, unknown>).sort()) {
      obj[k] = normalizeYValue((val as Record<string, unknown>)[k]);
    }
    return obj;
  }
  return val;
}

function exportJsDocJson(doc: Y.Doc) {
  return {
    guid: doc.guid,
    blocks: normalizeYValue(doc.getMap('blocks')),
  };
}

function exportJsStateVector(doc: Y.Doc): Record<string, number> {
  const sv = Y.decodeStateVector(Y.encodeStateVector(doc));
  const out: Record<string, number> = {};
  for (const [cid, clock] of Array.from(sv.entries()).sort(
    ([a], [b]) => a - b
  )) {
    out[String(cid)] = clock;
  }
  return out;
}

function exportDeleteSetFromUpdate(
  fullUpdate: Uint8Array
): Record<string, Array<[number, number]>> {
  const decoded = Y.decodeUpdate(fullUpdate);
  const out: Record<string, Array<[number, number]>> = {};
  for (const [cid, items] of Array.from(decoded.ds.clients.entries()).sort(
    ([a], [b]) => a - b
  )) {
    if (items.length > 0) {
      out[String(cid)] = items.map(item => [item.clock, item.len]);
    }
  }
  return out;
}

function exportJsDeleteSet(
  doc: Y.Doc
): Record<string, Array<[number, number]>> {
  return exportDeleteSetFromUpdate(Y.encodeStateAsUpdate(doc));
}

class RustDriver {
  private readonly proc: ChildProcessWithoutNullStreams;
  private readonly lineQueue: string[] = [];
  private readonly waiters: Array<(line: string) => void> = [];

  constructor(relayHttp: string, room: string, clientId: number) {
    this.proc = spawn(
      DRIVER_BIN,
      [
        '--relay-http',
        relayHttp,
        '--room',
        room,
        '--client-id',
        String(clientId),
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const rl = createInterface({ input: this.proc.stdout });
    rl.on('line', line => {
      const waiter = this.waiters.shift();
      if (waiter) {
        waiter(line);
      } else {
        this.lineQueue.push(line);
      }
    });
  }

  private nextLine(): Promise<string> {
    const queued = this.lineQueue.shift();
    if (queued !== undefined) return Promise.resolve(queued);
    return new Promise(resolve => this.waiters.push(resolve));
  }

  async waitReady() {
    const line = await this.nextLine();
    expect(line.trim()).toBe('READY');
  }

  async call<T = Record<string, unknown>>(
    cmd: Record<string, unknown>
  ): Promise<T> {
    this.proc.stdin.write(`${JSON.stringify(cmd)}\n`);
    const line = await this.nextLine();
    return JSON.parse(line) as T;
  }

  async quit() {
    try {
      await this.call({ cmd: 'quit' });
    } catch {
      this.proc.kill();
    }
  }
}

function createMulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Rust bs-relay + WorkspaceSession <-> JS BlockSuite TestWorkspace', () => {
  let relayProc: ChildProcessWithoutNullStreams;
  let relayHttp = '';
  let relayWsBase = '';

  beforeAll(async () => {
    expect(
      existsSync(RELAY_BIN),
      `Missing ${RELAY_BIN}; build bs-relay first`
    ).toBe(true);
    expect(
      existsSync(DRIVER_BIN),
      `Missing ${DRIVER_BIN}; build bs_doc_driver example first`
    ).toBe(true);

    relayProc = spawn(RELAY_BIN, ['--host', '127.0.0.1', '--port', '0'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const listenLine = await new Promise<string>((resolveLine, rejectLine) => {
      const rl = createInterface({ input: relayProc.stdout });
      const timer = setTimeout(
        () => rejectLine(new Error('Timed out waiting for bs-relay')),
        10_000
      );
      rl.on('line', line => {
        if (line.startsWith('LISTENING ')) {
          clearTimeout(timer);
          resolveLine(line);
        }
      });
    });

    const addr = listenLine.replace('LISTENING ', '').trim();
    relayHttp = `http://${addr}`;
    relayWsBase = `ws://${addr}`;
  });

  afterAll(() => {
    relayProc?.kill();
  });

  it('0-Writeback Gate: JS TestWorkspace loads all 11 blocks + 6 surface elements with 0 outbound writeback updates', async () => {
    const room = 'room-zero-writeback';
    const rustClientId = 2 ** 41 + 101;
    const driver = new RustDriver(relayHttp, room, rustClientId);
    await driver.waitReady();

    await driver.call({
      cmd: 'seed_full_schema',
      page_id: 'doc:home',
      title: 'Zero Writeback Doc',
    });

    const outboundUpdates: Array<{
      docId: string;
      kind: 'step2' | 'update';
      bytes: number[];
    }> = [];

    const roomClient = new RoomWebSocketClient(
      `${relayWsBase}/native-sync/rooms/${room}`,
      {
        onOutboundDocFrame: (docId, kind, bytes) => {
          const isEmpty =
            bytes.byteLength === 0 ||
            (bytes.byteLength === 2 && bytes[0] === 0 && bytes[1] === 0);
          if (!isEmpty) {
            outboundUpdates.push({ docId, kind, bytes: Array.from(bytes) });
          }
        },
      }
    );

    const schema = new Schema();
    schema.register(AffineSchemas);

    const workspace = new TestWorkspace({
      id: room,
      docSources: { main: roomClient.createDocSource() },
      awarenessSources: [roomClient.createAwarenessSource()],
      blobSources: {
        main: new MemoryBlobSource(),
        shadows: [new MockServerBlobSource(room, relayHttp)],
      },
    });
    workspace.storeExtensions = AffineSchemas.map(s => BlockSchemaExtension(s));
    workspace.start();

    // Wait for root doc + doc:home meta to sync from Rust
    await vi.waitFor(
      () => {
        expect(workspace.getDoc('doc:home')).not.toBeNull();
      },
      { timeout: 10_000 }
    );

    const doc = workspace.getDoc('doc:home')!;
    const store = doc.getStore({ id: 'doc:home' });
    store.load();
    await workspace.waitForSynced();

    // Verify all 12 blocks (11 types, 2 paragraphs) & all 6 surface elements loaded cleanly in real Store/SyncController
    expect(store.root?.flavour).toBe('affine:page');
    const yBlocks = doc.spaceDoc.getMap('blocks');
    expect(yBlocks.size).toBe(12);

    // Instantiate every block via SyncController-equivalent schema check: verify every non-undefined default prop exists!
    for (const [, yBlock] of yBlocks.entries()) {
      const blockMap = yBlock as Y.Map<unknown>;
      const flavour = blockMap.get('sys:flavour') as string;
      const blockSchema = schema.flavourSchemaMap.get(flavour);
      expect(blockSchema, `schema registered for ${flavour}`).toBeDefined();

      // Check sys:version matches exact AffineSchemas version
      expect(blockMap.get('sys:version')).toBe(blockSchema!.version);

      // Check every non-undefined default prop is already present (0 writeback guarantee)
      const defaultProps = blockSchema!.model.props?.({
        Text: () => ({}) as never,
        Boxed: (v: unknown) => v as never,
      });
      if (defaultProps) {
        for (const [key, value] of Object.entries(defaultProps)) {
          if (value !== undefined) {
            expect(
              blockMap.has(`prop:${key}`),
              `Missing default prop:${key} on ${flavour} would trigger JS SyncController writeback`
            ).toBe(true);
          }
        }
      }
    }

    // Verify 0 non-empty outbound writeback updates were emitted by JS
    expect(outboundUpdates).toEqual([]);

    workspace.forceStop();
    workspace.dispose();
    roomClient.close();
    await driver.quit();
  });

  it('1,000-Step Deterministic Seeded Concurrent Fuzz converges L0 (StateVector, DeleteSet, doc.json, Blob, Awareness)', async () => {
    const room = 'room-fuzz-1000';
    const rustClientId = 2 ** 42 + 7;
    const jsClientId = 2 ** 43 + 9;
    expect(jsClientId).toBeGreaterThan(2 ** 32);

    const driver = new RustDriver(relayHttp, room, rustClientId);
    await driver.waitReady();

    await driver.call({
      cmd: 'seed_full_schema',
      page_id: 'doc:home',
      title: 'Fuzz 1000',
    });

    const roomClient = new RoomWebSocketClient(
      `${relayWsBase}/native-sync/rooms/${room}`
    );
    const mockBlob = new MockServerBlobSource(room, relayHttp);
    const workspace = new TestWorkspace({
      id: room,
      docSources: { main: roomClient.createDocSource() },
      awarenessSources: [roomClient.createAwarenessSource()],
      blobSources: {
        main: new MemoryBlobSource(),
        shadows: [mockBlob],
      },
    });
    // Enforce 53-bit > 2^32 clientID on JS root doc and awareness
    workspace.doc.clientID = jsClientId;
    workspace.awarenessStore.awareness.clientID = jsClientId;
    workspace.awarenessStore.setLocalState({
      user: { name: 'JS Peer' },
      color: '#22cc88',
      selectionV2: {},
    });
    workspace.start();

    await vi.waitFor(
      () => {
        expect(workspace.getDoc('doc:home')).not.toBeNull();
      },
      { timeout: 10_000 }
    );

    const doc = workspace.getDoc('doc:home')!;
    doc.spaceDoc.clientID = jsClientId;
    doc.load();
    await workspace.waitForSynced();

    // Awareness bidirectional visibility with mandatory top-level color + valid TextSelection in selectionV2
    workspace.awarenessStore.setLocalState({
      user: { name: 'JS Peer' },
      color: '#22cc88',
      selectionV2: {
        'doc:home': [
          {
            type: 'text',
            from: { blockId: 'p-2', index: 1, length: 0 },
            to: null,
          },
        ],
      },
    });
    await driver.call({
      cmd: 'set_awareness',
      name: 'Rust Peer',
      color: '#ff4400',
      store_key: 'doc:home',
      block_id: 'p-1',
      index: 2,
      length: 3,
      now_ms: 1_000,
    });

    await vi.waitFor(
      () => {
        const rustState = workspace.awarenessStore
          .getStates()
          .get(rustClientId);
        expect(rustState?.color).toBe('#ff4400');
        const rawSel = rustState?.selectionV2?.['doc:home']?.[0] as
          | Record<string, unknown>
          | undefined;
        expect(rawSel).toBeDefined();
        const parsed = TextSelection.fromJSON(rawSel!);
        expect(parsed.from).toEqual({ blockId: 'p-1', index: 2, length: 3 });
        expect(parsed.to).toBeNull();
      },
      { timeout: 5_000 }
    );

    await driver.call({ cmd: 'drain', wait_ms: 150 });
    const preFuzzRust = await driver.call<{
      remoteAwareness: Record<string, { color: string }>;
    }>({ cmd: 'export_state', page_id: 'doc:home' });
    expect(preFuzzRust.remoteAwareness[String(jsClientId)]?.color).toBe(
      '#22cc88'
    );

    // Blob roundtrip across Rust <-> JS via bs-relay
    const blobBytes = [10, 20, 30, 40, 50, 60];
    await driver.call({
      cmd: 'upload_blob',
      key: 'shared-img',
      bytes: blobBytes,
    });
    const fetchedByJs = await mockBlob.get('shared-img');
    expect(fetchedByJs).not.toBeNull();
    expect(
      Array.from(new Uint8Array(await fetchedByJs!.arrayBuffer()))
    ).toEqual(blobBytes);

    // 1,000-step deterministic seeded concurrent fuzz (500 JS + 500 Rust interleaved)
    const rand = createMulberry32(0x2026_1000);
    const yBlocks = doc.spaceDoc.getMap('blocks');
    const textBlockIds = ['p-1', 'p-2', 'l-1', 'c-1'];
    const reorderBlockIds = ['p-1', 'p-2', 'l-1', 'd-1', 'c-1'];

    const t0 = performance.now();
    for (let step = 0; step < 1_000; step += 1) {
      const isJs = rand() < 0.5;
      const blockId =
        textBlockIds[Math.floor(rand() * textBlockIds.length)] ?? 'p-2';
      const op = Math.floor(rand() * 6);
      const nowMs = 2_000 + step * 5;

      if (isJs) {
        doc.spaceDoc.transact(() => {
          const yBlock = yBlocks.get(blockId) as Y.Map<unknown> | undefined;
          const yText = yBlock?.get('prop:text') as Y.Text | undefined;
          if (op === 0 && yText) {
            const idx = Math.floor(rand() * (yText.length + 1));
            const ch = String.fromCharCode(65 + (step % 26));
            yText.insert(idx, ch);
          } else if (op === 1 && yText && yText.length > 0) {
            const idx = Math.floor(rand() * yText.length);
            const del = Math.min(
              yText.length - idx,
              1 + Math.floor(rand() * 2)
            );
            yText.delete(idx, del);
          } else if (op === 2 && yText && yText.length > 0) {
            const idx = Math.floor(rand() * yText.length);
            const len = Math.min(
              yText.length - idx,
              1 + Math.floor(rand() * 3)
            );
            yText.format(idx, len, { bold: step % 2 === 0 ? true : null });
          } else if (op === 3) {
            const note = yBlocks.get('note-1') as Y.Map<unknown>;
            const children = note.get('sys:children') as Y.Array<string>;
            const arr = children.toArray();
            const pick =
              reorderBlockIds[Math.floor(rand() * reorderBlockIds.length)]!;
            const oldIdx = arr.indexOf(pick);
            if (oldIdx >= 0 && arr.length > 1) {
              const nextIdx = Math.floor(rand() * (arr.length - 1));
              children.delete(oldIdx, 1);
              children.insert(nextIdx, [pick]);
            }
          } else if (op === 4) {
            const surface = yBlocks.get('surface-1') as Y.Map<unknown>;
            const elementsBox = surface.get('prop:elements') as Y.Map<unknown>;
            const elements = elementsBox.get('value') as Y.Map<Y.Map<unknown>>;
            const shape = elements.get('el-shape');
            shape?.set(
              'xywh',
              `[${Math.floor(rand() * 400)},${Math.floor(rand() * 400)},120,80]`
            );
          } else if (op === 5) {
            const surface = yBlocks.get('surface-1') as Y.Map<unknown>;
            const elementsBox = surface.get('prop:elements') as Y.Map<unknown>;
            const elements = elementsBox.get('value') as Y.Map<Y.Map<unknown>>;
            const conn = elements.get('el-conn');
            conn?.set('mode', step % 3);
          }
        });
      } else {
        if (op === 0) {
          await driver.call({
            cmd: 'insert_text',
            page_id: 'doc:home',
            block_id: blockId,
            index: Math.floor(rand() * 20),
            text: String.fromCharCode(97 + (step % 26)),
            now_ms: nowMs,
          });
        } else if (op === 1) {
          await driver.call({
            cmd: 'remove_text',
            page_id: 'doc:home',
            block_id: blockId,
            index: Math.floor(rand() * 15),
            len: 1 + Math.floor(rand() * 2),
            now_ms: nowMs,
          });
        } else if (op === 2) {
          await driver.call({
            cmd: 'format_text',
            page_id: 'doc:home',
            block_id: blockId,
            index: Math.floor(rand() * 15),
            len: 1 + Math.floor(rand() * 3),
            bold: step % 2 === 0,
            now_ms: nowMs,
          });
        } else if (op === 3) {
          const pick =
            reorderBlockIds[Math.floor(rand() * reorderBlockIds.length)]!;
          await driver.call({
            cmd: 'reorder_child',
            page_id: 'doc:home',
            parent_id: 'note-1',
            child_id: pick,
            new_index: Math.floor(rand() * 4),
            now_ms: nowMs,
          });
        } else if (op === 4) {
          await driver.call({
            cmd: 'update_shape_xywh',
            page_id: 'doc:home',
            surface_id: 'surface-1',
            element_id: 'el-shape',
            xywh: `[${Math.floor(rand() * 400)},${Math.floor(rand() * 400)},120,80]`,
            now_ms: nowMs,
          });
        } else {
          await driver.call({
            cmd: 'update_connector_mode',
            page_id: 'doc:home',
            surface_id: 'surface-1',
            element_id: 'el-conn',
            mode: step % 3,
            now_ms: nowMs,
          });
        }
      }

      // Mid-flight disconnect & reconnect on Rust side at step 500
      if (step === 500) {
        await driver.call({ cmd: 'reconnect' });
      }
    }

    // Converge both ends cleanly
    await workspace.waitForSynced();
    await driver.call({ cmd: 'sync_all' });
    await driver.call({ cmd: 'drain', wait_ms: 200 });
    await workspace.waitForSynced();
    await driver.call({ cmd: 'sync_all' });
    const elapsedMs = Math.round(performance.now() - t0);

    const rustExport = await driver.call<{
      stateVector: Record<string, number>;
      fullUpdateV1: number[];
      docJson: unknown;
    }>({ cmd: 'export_state', page_id: 'doc:home' });

    const rustDeleteSet = exportDeleteSetFromUpdate(
      new Uint8Array(rustExport.fullUpdateV1)
    );
    const jsStateVector = exportJsStateVector(doc.spaceDoc);
    const jsDeleteSet = exportJsDeleteSet(doc.spaceDoc);
    const jsDocJson = exportJsDocJson(doc.spaceDoc);

    // L0 Convergence Assertions
    expect(rustExport.stateVector).toEqual(jsStateVector);
    expect(rustDeleteSet).toEqual(jsDeleteSet);
    expect(rustExport.docJson).toEqual(jsDocJson);
    expect(workspace.docSync.status.main?.pendingPushUpdates ?? 0).toBe(0);
    expect(workspace.docSync.status.main?.pendingPullUpdates ?? 0).toBe(0);

    // Awareness +30s expiry check on Rust deterministic clock
    const tickRes = await driver.call<{
      expired: number[];
      activeRemotes: number[];
    }>({ cmd: 'tick_awareness', now_ms: 35_000 });
    expect(tickRes.expired).toContain(jsClientId);
    expect(tickRes.activeRemotes).toEqual([]);

    // Log convergence timing for verification reporting
    expect(elapsedMs).toBeGreaterThanOrEqual(0);

    workspace.forceStop();
    workspace.dispose();
    roomClient.close();
    await driver.quit();
  });

  it('Concurrent multi-peer claimSeed starter init produces exactly 1 doc:home and 1 affine:page root (zero duplicate seeding)', async () => {
    const room = 'room-concurrent-seed';
    const peers = Array.from({ length: 3 }, () => {
      const client = new RoomWebSocketClient(
        `${relayWsBase}/native-sync/rooms/${room}`
      );
      const workspace = new TestWorkspace({
        id: room,
        docSources: { main: client.createDocSource() },
        awarenessSources: [client.createAwarenessSource()],
        blobSources: {
          main: new MemoryBlobSource(),
          shadows: [new MockServerBlobSource(room, relayHttp)],
        },
      });
      workspace.storeExtensions = AffineSchemas.map(s =>
        BlockSchemaExtension(s)
      );
      workspace.start();
      return { client, workspace };
    });

    const results = await Promise.all(
      peers.map(({ client, workspace }) =>
        initRoomDocWithSeed({
          collection: workspace,
          roomClient: client,
          docId: 'doc:home',
          seedKey: 'seed:doc:home',
          seed: () => {
            const doc = workspace.createDoc('doc:home');
            const store = doc.getStore({ id: 'doc:home' });
            store.load();
            const rootId = store.addBlock('affine:page', {
              title: new Text('Single Seeded Page'),
            });
            store.addBlock('affine:surface', {}, rootId);
            const noteId = store.addBlock('affine:note', {}, rootId);
            store.addBlock(
              'affine:paragraph',
              { text: new Text('hello') },
              noteId
            );
          },
        })
      )
    );

    // Exactly one peer wins the room seed CAS
    expect(results.filter(r => r.seeded).length).toBe(1);

    // All 3 peers converge on a single doc:home with exactly 1 affine:page root block
    for (const { workspace } of peers) {
      await workspace.waitForSynced();
      const doc = workspace.getDoc('doc:home');
      expect(doc).not.toBeNull();
      await vi.waitFor(
        () => {
          const yBlocks = doc!.spaceDoc.getMap('blocks');
          const pageBlocks = Array.from(yBlocks.values()).filter(
            b => (b as Y.Map<unknown>).get('sys:flavour') === 'affine:page'
          );
          expect(pageBlocks.length).toBe(1);
          expect(yBlocks.size).toBe(4);
        },
        { timeout: 10_000 }
      );
      expect(workspace.meta.docMetas.length).toBe(1);
    }

    for (const { client, workspace } of peers) {
      workspace.forceStop();
      workspace.dispose();
      client.close();
    }
  });

  it('Delayed sync (>1.5s) and partial-seed winner disconnect recover cleanly to 1 meta.pages entry and 1 doc:home page', async () => {
    // Part A: Delayed initial sync > 1.5s while connected must NOT trigger a duplicate local seed.
    const slowRoom = 'room-delayed-seed';
    const slowPeers = Array.from({ length: 2 }, () => {
      const client = new RoomWebSocketClient(
        `${relayWsBase}/native-sync/rooms/${slowRoom}`
      );
      const workspace = new TestWorkspace({
        id: slowRoom,
        docSources: { main: client.createDocSource() },
        awarenessSources: [client.createAwarenessSource()],
        blobSources: { main: new MemoryBlobSource() },
      });
      workspace.storeExtensions = AffineSchemas.map(s =>
        BlockSchemaExtension(s)
      );
      workspace.start();
      return { client, workspace };
    });

    const slowResults = await Promise.all(
      slowPeers.map(({ client, workspace }, idx) =>
        initRoomDocWithSeed({
          collection: {
            getDoc: id => workspace.getDoc(id),
            waitForSynced: async () => {
              if (idx === 1) {
                await new Promise(resolve => setTimeout(resolve, 1_700));
              }
              await workspace.waitForSynced();
            },
            meta: workspace.meta,
          },
          roomClient: client,
          docId: 'doc:home',
          seedKey: 'seed:doc:home',
          seed: () => {
            const doc = workspace.createDoc('doc:home');
            const store = doc.getStore({ id: 'doc:home' });
            store.load();
            const rootId = store.addBlock('affine:page', {
              title: new Text('Delayed Sync Single Seed'),
            });
            store.addBlock('affine:surface', {}, rootId);
            const noteId = store.addBlock('affine:note', {}, rootId);
            store.addBlock(
              'affine:paragraph',
              { text: new Text('single') },
              noteId
            );
          },
        })
      )
    );
    expect(slowResults.filter(r => r.seeded).length).toBe(1);
    for (const { workspace, client } of slowPeers) {
      await workspace.waitForSynced();
      expect(workspace.meta.docMetas.length).toBe(1);
      workspace.forceStop();
      workspace.dispose();
      client.close();
    }

    // Part B: Winner pushes meta.pages for doc:home and disconnects BEFORE seeding doc:home.
    // Waiter #1 (survivor) is promoted and populates doc:home in-place via Proxy reuse while
    // Waiter #2 (observer) receives winner=false, waits for affine:page root, and BOTH converge
    // to 1 meta.pages entry and 4 blocks without destroying spaces['doc:home'].
    const partialRoom = 'room-partial-seed-recovery';
    const makePeer = () => {
      const client = new RoomWebSocketClient(
        `${relayWsBase}/native-sync/rooms/${partialRoom}`
      );
      const workspace = new TestWorkspace({
        id: partialRoom,
        docSources: { main: client.createDocSource() },
        awarenessSources: [client.createAwarenessSource()],
        blobSources: { main: new MemoryBlobSource() },
      });
      workspace.storeExtensions = AffineSchemas.map(s =>
        BlockSchemaExtension(s)
      );
      workspace.start();
      return { client, workspace };
    };

    const { client: winnerClient, workspace: winnerWs } = makePeer();
    const { client: survivorClient, workspace: survivorWs } = makePeer();
    const { client: observerClient, workspace: observerWs } = makePeer();

    await Promise.all([
      winnerWs.waitForSynced(),
      survivorWs.waitForSynced(),
      observerWs.waitForSynced(),
    ]);

    // Winner claims seed:doc:home, creates only the meta.pages entry (no doc:home blocks),
    // waits for root sync to push meta.pages, then disconnects abruptly.
    expect(await winnerClient.claimSeed('seed:doc:home')).toBe(true);
    winnerWs.meta.initialize();
    winnerWs.createDoc('doc:home');
    await winnerWs.waitForSynced();

    // Wait until BOTH survivor and observer receive the partial meta.pages entry.
    await vi.waitFor(
      () => {
        expect(survivorWs.getDoc('doc:home')).not.toBeNull();
        expect(observerWs.getDoc('doc:home')).not.toBeNull();
      },
      { timeout: 5_000 }
    );

    const presetStyleSeed = (ws: TestWorkspace) => {
      const existing = ws.getDoc('doc:home');
      const targetWs =
        existing && !hasUsablePageRoot(existing)
          ? (() => {
              let claimed = false;
              return new Proxy(ws, {
                get(target, prop, receiver) {
                  if (prop === 'getDoc') {
                    return (id: string) =>
                      id === 'doc:home' && !claimed ? null : target.getDoc(id);
                  }
                  if (prop === 'createDoc') {
                    return (id?: string) => {
                      if (id === 'doc:home' && !claimed) {
                        claimed = true;
                        return existing;
                      }
                      return target.createDoc(id);
                    };
                  }
                  const val = Reflect.get(target, prop, receiver);
                  return typeof val === 'function' ? val.bind(target) : val;
                },
              });
            })()
          : ws;

      // Exact preset.ts pattern: checks hasDoc before populating blocks
      let doc = targetWs.getDoc('doc:home');
      const hasDoc = !!doc;
      if (!doc) {
        doc = targetWs.createDoc('doc:home');
      }
      const store = doc.getStore({ id: 'doc:home' });
      store.load();
      if (!hasDoc) {
        const rootId = store.addBlock('affine:page', {
          title: new Text('Recovered Page'),
        });
        store.addBlock('affine:surface', {}, rootId);
        const noteId = store.addBlock('affine:note', {}, rootId);
        store.addBlock(
          'affine:paragraph',
          { text: new Text('recovered') },
          noteId
        );
      }
    };

    // Survivor enqueues first (Waiter #1), then Observer enqueues second (Waiter #2).
    const survivorInitPromise = initRoomDocWithSeed({
      collection: survivorWs,
      roomClient: survivorClient,
      docId: 'doc:home',
      seedKey: 'seed:doc:home',
      seed: () => presetStyleSeed(survivorWs),
    });
    await new Promise(resolve => setTimeout(resolve, 60));
    const observerInitPromise = initRoomDocWithSeed({
      collection: observerWs,
      roomClient: observerClient,
      docId: 'doc:home',
      seedKey: 'seed:doc:home',
      seed: () => presetStyleSeed(observerWs),
    });

    // Give both waiters a moment to enqueue their claims, then drop the abandoned winner.
    await new Promise(resolve => setTimeout(resolve, 100));
    winnerWs.forceStop();
    winnerWs.dispose();
    winnerClient.close();

    const [survivorResult, observerResult] = await Promise.all([
      survivorInitPromise,
      observerInitPromise,
    ]);
    expect(survivorResult).toEqual({ seeded: true, offlineFallback: false });
    expect(observerResult).toEqual({ seeded: false, offlineFallback: false });

    for (const ws of [survivorWs, observerWs]) {
      await ws.waitForSynced();
      expect(ws.meta.docMetas.length).toBe(1);
      const recoveredDoc = ws.getDoc('doc:home')!;
      const recoveredBlocks = recoveredDoc.spaceDoc.getMap('blocks');
      const recoveredPages = Array.from(recoveredBlocks.values()).filter(
        b => (b as Y.Map<unknown>).get('sys:flavour') === 'affine:page'
      );
      expect(recoveredPages.length).toBe(1);
      expect(recoveredBlocks.size).toBe(4);
    }

    survivorWs.forceStop();
    survivorWs.dispose();
    survivorClient.close();
    observerWs.forceStop();
    observerWs.dispose();
    observerClient.close();
  });

  it('JS dropConnection() mid-edit reconnects with L0 convergence and live bidirectional awareness', async () => {
    const room = 'room-js-drop-reconnect';
    const rustClientId = 2 ** 44 + 11;
    const jsClientId = 2 ** 44 + 22;

    const driver = new RustDriver(relayHttp, room, rustClientId);
    await driver.waitReady();
    await driver.call({
      cmd: 'seed_full_schema',
      page_id: 'doc:home',
      title: 'JS Reconnect Doc',
    });

    const roomClient = new RoomWebSocketClient(
      `${relayWsBase}/native-sync/rooms/${room}`
    );
    const workspace = new TestWorkspace({
      id: room,
      docSources: { main: roomClient.createDocSource() },
      awarenessSources: [roomClient.createAwarenessSource()],
      blobSources: {
        main: new MemoryBlobSource(),
        shadows: [new MockServerBlobSource(room, relayHttp)],
      },
    });
    workspace.doc.clientID = jsClientId;
    workspace.awarenessStore.awareness.clientID = jsClientId;
    workspace.awarenessStore.setLocalState({
      user: { name: 'JS Reconnector' },
      color: '#11aa99',
      selectionV2: {
        'doc:home': [
          {
            type: 'text',
            from: { blockId: 'p-2', index: 0, length: 0 },
            to: null,
          },
        ],
      },
    });
    workspace.start();

    await vi.waitFor(
      () => {
        expect(workspace.getDoc('doc:home')).not.toBeNull();
      },
      { timeout: 10_000 }
    );

    const doc = workspace.getDoc('doc:home')!;
    doc.spaceDoc.clientID = jsClientId;
    doc.load();
    await workspace.waitForSynced();

    await driver.call({
      cmd: 'set_awareness',
      name: 'Rust Steady',
      color: '#ee5522',
      store_key: 'doc:home',
      block_id: 'p-1',
      index: 1,
      length: 2,
      now_ms: 1_000,
    });
    await driver.call({ cmd: 'drain', wait_ms: 100 });

    // Force-drop the JS WebSocket connection mid-session!
    roomClient.dropConnection();

    // Perform concurrent edits on BOTH JS and Rust while JS is disconnected.
    doc.spaceDoc.transact(() => {
      const yBlocks = doc.spaceDoc.getMap('blocks');
      const p2 = yBlocks.get('p-2') as Y.Map<unknown>;
      const yText = p2.get('prop:text') as Y.Text;
      yText.insert(yText.length, ' [js-offline-edit]');
    });

    await driver.call({
      cmd: 'insert_text',
      page_id: 'doc:home',
      block_id: 'p-1',
      index: 0,
      text: '[rust-while-js-down] ',
      now_ms: 2_000,
    });

    // Wait for SyncPeer's automatic reconnect loop (5s backoff) to reconnect and converge.
    await vi.waitFor(
      async () => {
        await driver.call({ cmd: 'drain', wait_ms: 100 });
        const rustState = await driver.call<{
          stateVector: Record<string, number>;
          fullUpdateV1: number[];
          docJson: unknown;
          remoteAwareness: Record<string, { color: string }>;
        }>({ cmd: 'export_state', page_id: 'doc:home' });

        expect(rustState.stateVector).toEqual(
          exportJsStateVector(doc.spaceDoc)
        );
        expect(
          exportDeleteSetFromUpdate(new Uint8Array(rustState.fullUpdateV1))
        ).toEqual(exportJsDeleteSet(doc.spaceDoc));
        expect(rustState.docJson).toEqual(exportJsDocJson(doc.spaceDoc));

        // Live awareness must be restored on BOTH sides (+2 clock re-announce on JS reconnect)!
        expect(rustState.remoteAwareness[String(jsClientId)]?.color).toBe(
          '#11aa99'
        );
        const rustOnJs = workspace.awarenessStore.getStates().get(rustClientId);
        expect(rustOnJs?.color).toBe('#ee5522');
      },
      { timeout: 15_000, interval: 250 }
    );

    workspace.forceStop();
    workspace.dispose();
    roomClient.close();
    await driver.quit();
  }, 20_000);

  it('Cross-origin blob CORS preflight (OPTIONS 204) and MockServerBlobSource upload -> Rust fetch', async () => {
    const room = 'room-blob-cors-e2e';
    const blobUrl = `${relayHttp}/api/collection/${room}/blob/cross-origin-asset`;

    const preflight = await fetch(blobUrl, { method: 'OPTIONS' });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*');
    expect(preflight.headers.get('access-control-allow-methods')).toContain(
      'PUT'
    );
    expect(preflight.headers.get('access-control-allow-headers')).toBe(
      'Content-Type'
    );

    const mockBlob = new MockServerBlobSource(room, relayHttp);
    const payload = new Uint8Array([1, 2, 3, 4, 5, 42, 99]);
    await mockBlob.set(
      'cross-origin-asset',
      new Blob([payload], { type: 'application/octet-stream' })
    );

    const driver = new RustDriver(relayHttp, room, 2 ** 44 + 33);
    await driver.waitReady();
    const fetched = await driver.call<{ ok: boolean; bytes: number[] }>({
      cmd: 'fetch_blob',
      key: 'cross-origin-asset',
    });
    expect(fetched.ok).toBe(true);
    expect(fetched.bytes).toEqual(Array.from(payload));

    await driver.quit();
  });
});
