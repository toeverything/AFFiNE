import {
  diffUpdateV1,
  encodeStateVectorFromUpdateV1,
  mergeUpdatesV1,
  type YOctoAwarenessSession,
  type YOctoDocSession,
} from '@blocksuite/sync/y-octo';
import { describe, expect, test } from 'vitest';
import {
  applyAwarenessUpdate,
  Awareness,
  encodeAwarenessUpdate,
} from 'y-protocols/awareness.js';
import * as Y from 'yjs';

import {
  applyDocUpdate,
  BlockSchemaExtension,
  type Boxed,
  createTextRelativePosition,
  createTextUndoManager,
  defineBlockSchema,
  type DocEngineType,
  encodeDocStateAsUpdate,
  resolveTextRelativePosition,
  Text,
} from '../index.js';
import { TestWorkspace } from '../test/index.js';
import {
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  RootBlockSchemaExtension,
} from './test-schema.js';

const FlatTableBlockSchema = defineBlockSchema({
  flavour: 'affine:note-block-table',
  props: internal => ({
    title: internal.Text(),
    rows: {} as Record<string, { rowId: string; order: string }>,
    columns: {} as Record<string, { columnId: string; name: string }>,
    cells: {} as Record<string, { value: unknown }>,
  }),
  metadata: {
    version: 1,
    role: 'content',
    parent: ['affine:note'],
    isFlatData: true,
  },
});

const DatabaseBlockSchema = defineBlockSchema({
  flavour: 'affine:database',
  props: internal => ({
    title: internal.Text(),
    views: [] as Array<Record<string, unknown>>,
    columns: [] as Array<Record<string, unknown>>,
  }),
  metadata: {
    version: 1,
    role: 'content',
    parent: ['affine:note'],
    children: ['affine:paragraph'],
  },
});

const SurfaceTestBlockSchema = defineBlockSchema({
  flavour: 'affine:surface',
  props: internal => ({
    elements: internal.Boxed(new Y.Map<Y.Map<unknown>>()),
  }),
  metadata: {
    version: 5,
    role: 'hub',
    parent: ['affine:page'],
    children: [],
  },
});

const ALL_EXTENSIONS = [
  RootBlockSchemaExtension,
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  BlockSchemaExtension(FlatTableBlockSchema),
  BlockSchemaExtension(DatabaseBlockSchema),
  BlockSchemaExtension(SurfaceTestBlockSchema),
];

function createTestStore(docEngine: DocEngineType, docId = 'doc-1') {
  const workspace = new TestWorkspace({ id: 'ws-test', docEngine });
  workspace.meta.initialize();
  workspace.storeExtensions = ALL_EXTENSIONS;
  const doc = workspace.createDoc(docId);
  doc.load();
  const store = doc.getStore();
  store.load();
  return { workspace, doc, store };
}

describe.each<DocEngineType>(['yjs', 'y-octo'])(
  'Y-Octo Store Engine Parity (%s)',
  docEngine => {
    test('1. Page block tree CRUD + flat isFlatData table + database array-of-maps', () => {
      const { doc, store } = createTestStore(docEngine);

      const pageId = store.addBlock('affine:page', {
        title: new Text('Page Title'),
      });
      const noteId = store.addBlock('affine:note', {}, pageId);
      const p1 = store.addBlock(
        'affine:paragraph',
        { text: new Text('first') },
        noteId
      );
      const p2 = store.addBlock(
        'affine:paragraph',
        { text: new Text('second') },
        noteId
      );
      const p3 = store.addBlock(
        'affine:paragraph',
        { text: new Text('third') },
        noteId
      );

      expect(store.root?.id).toBe(pageId);
      expect(store.getModelById(noteId)?.children.map(c => c.id)).toEqual([
        p1,
        p2,
        p3,
      ]);

      // moveBlocks: move p3 before p1
      const noteModel = store.getModelById(noteId)!;
      const p1Model = store.getModelById(p1)!;
      const p3Model = store.getModelById(p3)!;
      store.moveBlocks([p3Model], noteModel, p1Model, true);
      expect(noteModel.children.map(c => c.id)).toEqual([p3, p1, p2]);

      // updateBlock
      store.updateBlock(p1Model, { type: 'h1' });
      expect((p1Model.props as { type: string }).type).toBe('h1');

      // deleteBlock
      store.deleteBlock(p2);
      expect(store.getBlock(p2)).toBeUndefined();
      expect(noteModel.children.map(c => c.id)).toEqual([p3, p1]);

      // Flat isFlatData table block
      const tableId = store.addBlock(
        'affine:note-block-table',
        {
          title: new Text('Budget'),
          rows: { r1: { rowId: 'r1', order: 'a0' } },
          columns: { c1: { columnId: 'c1', name: 'Amount' } },
          cells: { 'r1:c1': { value: 42 } },
        },
        noteId
      );
      const tableModel = store.getModelById(tableId)!;
      const tableProps = tableModel.props as {
        rows: Record<string, { rowId: string; order: string }>;
        cells: Record<string, { value: unknown }>;
      };
      expect(tableProps.rows.r1.order).toBe('a0');
      expect(tableProps.cells['r1:c1'].value).toBe(42);
      tableProps.cells['r1:c1'].value = 99;
      expect(tableProps.cells['r1:c1'].value).toBe(99);

      // Database array of maps
      const dbId = store.addBlock(
        'affine:database',
        {
          title: new Text('Tasks'),
          views: [{ id: 'v1', name: 'Table', mode: 'table' }],
          columns: [{ id: 'col1', name: 'Status', type: 'select' }],
        },
        noteId
      );
      const dbModel = store.getModelById(dbId)!;
      const dbProps = dbModel.props as {
        views: Array<Record<string, unknown>>;
        columns: Array<Record<string, unknown>>;
      };
      expect(dbProps.views[0].name).toBe('Table');
      dbProps.views[0].name = 'Kanban';
      expect(dbProps.views[0].name).toBe('Kanban');
      dbProps.columns.splice(1, 0, {
        id: 'col2',
        name: 'Priority',
        type: 'number',
      });
      expect(dbProps.columns.length).toBe(2);
      expect(dbProps.columns[1].name).toBe('Priority');

      // Verify V1 binary round-trip to opposite engine
      const otherEngine: DocEngineType = docEngine === 'yjs' ? 'y-octo' : 'yjs';
      const peer = createTestStore(otherEngine, 'doc-1');
      const snapshot = encodeDocStateAsUpdate(doc.spaceDoc);
      applyDocUpdate(peer.doc.spaceDoc, snapshot, 'remote');

      expect(peer.store.getModelById(noteId)?.children.map(c => c.id)).toEqual([
        p3,
        p1,
        tableId,
        dbId,
      ]);
      expect(
        (peer.store.getModelById(p1)!.props as { type: string }).type
      ).toBe('h1');
      expect(
        (
          peer.store.getModelById(tableId)!.props as {
            cells: Record<string, { value: unknown }>;
          }
        ).cells['r1:c1'].value
      ).toBe(99);
      expect(
        (
          peer.store.getModelById(dbId)!.props as {
            views: Array<Record<string, unknown>>;
            columns: Array<Record<string, unknown>>;
          }
        ).views[0].name
      ).toBe('Kanban');
      expect(
        (
          peer.store.getModelById(dbId)!.props as {
            columns: Array<Record<string, unknown>>;
          }
        ).columns.length
      ).toBe(2);

      doc.dispose();
      peer.doc.dispose();
    });

    test('2. Rich Text operations + Preact signals + RelativePosition across concurrent edits & undo/redo', () => {
      const { doc, store } = createTestStore(docEngine);
      const pageId = store.addBlock('affine:page', {});
      const noteId = store.addBlock('affine:note', {}, pageId);
      const pId = store.addBlock(
        'affine:paragraph',
        { text: new Text('Hello world') },
        noteId
      );
      store.captureSync();

      const pModel = store.getModelById(pId)!;
      const text = pModel.text!;

      const observedLengths: number[] = [];
      const observedDeltas: number[] = [];
      const disposeLen = text.length$.subscribe(v => observedLengths.push(v));
      const disposeDelta = text.deltas$.subscribe(d =>
        observedDeltas.push(d.length)
      );

      // Anchor cursor right before "world" (index 6)
      const anchor = createTextRelativePosition(text.yText, 6);
      expect(resolveTextRelativePosition(anchor, doc.spaceDoc)).toBe(6);

      // Insert prefix at 0 -> anchor should shift from 6 to 10
      text.insert('Say ', 0);
      expect(text.toString()).toBe('Say Hello world');
      expect(text.length).toBe(15);
      expect(resolveTextRelativePosition(anchor, doc.spaceDoc)).toBe(10);

      // Format "Hello" bold
      text.format(4, 5, { bold: true });
      const formattedDelta = text.toDelta();
      expect(formattedDelta).toEqual([
        { insert: 'Say ' },
        { insert: 'Hello', attributes: { bold: true } },
        { insert: ' world' },
      ]);

      // Apply delta + embed
      text.insertEmbed({ mention: 'alice' }, 15);
      expect(text.length).toBe(16);
      expect(text.toDelta().at(-1)?.insert).toEqual({ mention: 'alice' });

      // Delete embed
      text.delete(15, 1);
      expect(text.length).toBe(15);

      // Simulate remote concurrent insert at index 0 from a Yjs peer
      const remoteDoc = new Y.Doc({ guid: 'doc-1' });
      Y.applyUpdate(remoteDoc, encodeDocStateAsUpdate(doc.spaceDoc));
      const remoteBlock = remoteDoc.getMap('blocks').get(pId) as Y.Map<unknown>;
      const remoteText = remoteBlock.get('prop:text') as Y.Text;
      const svBeforeRemote = Y.encodeStateVector(remoteDoc);
      remoteDoc.transact(() => {
        remoteText.insert(0, '[R]');
      });
      const remoteDiff = Y.encodeStateAsUpdate(remoteDoc, svBeforeRemote);
      applyDocUpdate(doc.spaceDoc, remoteDiff, 'remote');

      expect(text.toString()).toBe('[R]Say Hello world');
      // Anchor before "world" shifted by +3
      expect(resolveTextRelativePosition(anchor, doc.spaceDoc)).toBe(13);

      // Undo local changes (prefix + format + embed) while keeping remote '[R]'
      store.undo();
      expect(text.toString()).toBe('[R]Hello world');
      expect(resolveTextRelativePosition(anchor, doc.spaceDoc)).toBe(9);

      // Redo restores local changes
      store.redo();
      expect(text.toString()).toBe('[R]Say Hello world');
      expect(resolveTextRelativePosition(anchor, doc.spaceDoc)).toBe(13);

      // Text-scoped undo manager
      const textUm = createTextUndoManager(text);
      text.insert('!', text.length);
      expect(text.toString()).toBe('[R]Say Hello world!');
      textUm.undo();
      expect(text.toString()).toBe('[R]Say Hello world');

      expect(observedLengths.length).toBeGreaterThan(2);
      expect(observedDeltas.length).toBeGreaterThan(2);

      disposeLen();
      disposeDelta();
      textUm.destroy();
      remoteDoc.destroy();
      doc.dispose();
    });

    test('3. Edgeless Surface nested elements + unknown extension fields zero loss', () => {
      const { doc, store } = createTestStore(docEngine);
      const pageId = store.addBlock('affine:page', {});
      const surfaceId = store.addBlock('affine:surface', {}, pageId);
      const surfaceModel = store.getModelById(surfaceId)!;
      const elementsBox = (
        surfaceModel.props as { elements: Boxed<Y.Map<Y.Map<unknown>>> }
      ).elements;
      const elementsMap = elementsBox.getValue()!;

      store.transact(() => {
        const shape = new Y.Map<unknown>();
        shape.set('id', 'el-1');
        shape.set('type', 'shape');
        shape.set('xywh', '[0,0,120,80]');
        shape.set('rotate', 15.5);
        shape.set('customExt:tag', 'preserve-me');
        elementsMap.set('el-1', shape);
      });

      const el1 = elementsMap.get('el-1')!;
      expect(el1.get('xywh')).toBe('[0,0,120,80]');
      expect(el1.get('rotate')).toBe(15.5);
      expect(el1.get('customExt:tag')).toBe('preserve-me');

      // Update child element property
      store.transact(() => {
        el1.set('xywh', '[20,30,120,80]');
        el1.set('rotate', 45.25);
      });
      expect(el1.get('xywh')).toBe('[20,30,120,80]');
      expect(el1.get('rotate')).toBe(45.25);
      expect(el1.get('customExt:tag')).toBe('preserve-me');

      // Sync to opposite engine and verify zero loss
      const otherEngine: DocEngineType = docEngine === 'yjs' ? 'y-octo' : 'yjs';
      const peer = createTestStore(otherEngine, 'doc-1');
      applyDocUpdate(
        peer.doc.spaceDoc,
        encodeDocStateAsUpdate(doc.spaceDoc),
        'remote'
      );

      const peerSurface = peer.store.getModelById(surfaceId)!;
      const peerElements = (
        peerSurface.props as { elements: Boxed<Y.Map<Y.Map<unknown>>> }
      ).elements.getValue()!;
      const peerEl1 = peerElements.get('el-1')!;
      expect(peerEl1.get('type')).toBe('shape');
      expect(peerEl1.get('xywh')).toBe('[20,30,120,80]');
      expect(peerEl1.get('rotate')).toBe(45.25);
      expect(peerEl1.get('customExt:tag')).toBe('preserve-me');

      doc.dispose();
      peer.doc.dispose();
    });

    test('4. Shared Doc with two Store views + selective local undo preserving remote Yjs edits', () => {
      const { doc, store: storeA } = createTestStore(docEngine);
      const storeB = doc.getStore({ id: 'view-b' });
      storeB.load();

      const pageId = storeA.addBlock('affine:page', {});
      const noteId = storeA.addBlock('affine:note', {}, pageId);
      storeA.captureSync();

      expect(storeB.getModelById(pageId)).not.toBeNull();
      expect(storeB.getModelById(noteId)).not.toBeNull();

      // Local edit on storeA
      const localP = storeA.addBlock(
        'affine:paragraph',
        { text: new Text('local-a') },
        noteId
      );
      storeA.captureSync();
      expect(storeB.getModelById(localP)?.text?.toString()).toBe('local-a');

      // Remote peer concurrently adds another paragraph
      const remoteDoc = new Y.Doc({ guid: 'doc-1' });
      Y.applyUpdate(remoteDoc, encodeDocStateAsUpdate(doc.spaceDoc));
      const svBefore = Y.encodeStateVector(remoteDoc);
      remoteDoc.transact(() => {
        const blocks = remoteDoc.getMap('blocks');
        const remoteBlock = new Y.Map<unknown>();
        remoteBlock.set('sys:id', 'remote-p');
        remoteBlock.set('sys:flavour', 'affine:paragraph');
        remoteBlock.set('sys:version', 1);
        remoteBlock.set('sys:children', new Y.Array<string>());
        remoteBlock.set('prop:type', 'text');
        remoteBlock.set('prop:text', new Y.Text('from-remote'));
        blocks.set('remote-p', remoteBlock);
        const remoteNote = blocks.get(noteId) as Y.Map<unknown>;
        (remoteNote.get('sys:children') as Y.Array<string>).push(['remote-p']);
      });
      const remoteUpdate = Y.encodeStateAsUpdate(remoteDoc, svBefore);
      applyDocUpdate(doc.spaceDoc, remoteUpdate, 'remote');

      expect(storeA.getModelById('remote-p')?.text?.toString()).toBe(
        'from-remote'
      );
      expect(storeB.getModelById('remote-p')?.text?.toString()).toBe(
        'from-remote'
      );

      // Undo on storeA should only undo localP and preserve remote-p
      expect(storeA.canUndo).toBe(true);
      storeA.undo();

      expect(storeA.getModelById(localP)).toBeNull();
      expect(storeB.getModelById(localP)).toBeNull();
      expect(storeA.getModelById('remote-p')?.text?.toString()).toBe(
        'from-remote'
      );
      expect(storeB.getModelById('remote-p')?.text?.toString()).toBe(
        'from-remote'
      );

      // Redo brings localP back in both views
      expect(storeA.canRedo).toBe(true);
      storeA.redo();
      expect(storeA.getModelById(localP)?.text?.toString()).toBe('local-a');
      expect(storeB.getModelById(localP)?.text?.toString()).toBe('local-a');

      remoteDoc.destroy();
      storeB.dispose();
      doc.dispose();
    });
  }
);

describe('Y-Octo Binary Sync & Awareness Interop', () => {
  test('5. Wire mergeUpdatesV1 / diffUpdateV1 / encodeStateVectorFromUpdateV1 + YOctoAwarenessSession <-> y-protocols Awareness', () => {
    const { doc: octoDoc, store: octoStore } = createTestStore(
      'y-octo',
      'interop-doc'
    );
    const updates: Uint8Array[] = [];
    octoDoc.spaceDoc.on('update', (u: Uint8Array) => {
      updates.push(u);
    });

    const pageId = octoStore.addBlock('affine:page', {
      title: new Text('Interop'),
    });
    const noteId = octoStore.addBlock('affine:note', {}, pageId);
    const p1 = octoStore.addBlock(
      'affine:paragraph',
      { text: new Text('alpha') },
      noteId
    );
    const p2 = octoStore.addBlock(
      'affine:paragraph',
      { text: new Text('beta') },
      noteId
    );

    expect(updates.length).toBeGreaterThanOrEqual(4);
    const merged = mergeUpdatesV1(updates);
    const sv = encodeStateVectorFromUpdateV1(merged);

    // Apply merged update to a Yjs store
    const { doc: yjsDoc, store: yjsStore } = createTestStore(
      'yjs',
      'interop-doc'
    );
    applyDocUpdate(yjsDoc.spaceDoc, merged, 'remote');
    expect(yjsStore.getModelById(p1)?.text?.toString()).toBe('alpha');
    expect(yjsStore.getModelById(p2)?.text?.toString()).toBe('beta');

    // Add another block on octoStore, compute diffUpdateV1 against sv, apply to yjsStore
    const p3 = octoStore.addBlock(
      'affine:paragraph',
      { text: new Text('gamma') },
      noteId
    );
    const fullAfter = encodeDocStateAsUpdate(octoDoc.spaceDoc);
    const diff = diffUpdateV1(fullAfter, sv);
    applyDocUpdate(yjsDoc.spaceDoc, diff, 'remote');
    expect(yjsStore.getModelById(p3)?.text?.toString()).toBe('gamma');

    // Awareness interop: YOctoAwarenessSession <-> y-protocols Awareness
    const octoAwareness = octoDoc.awarenessStore
      .awareness as unknown as YOctoAwarenessSession;
    const yjsAwareness = new Awareness(yjsDoc.spaceDoc);

    octoDoc.awarenessStore.setLocalStateField('user', { name: 'OctoUser' });
    const octoPayload = octoAwareness.encodeUpdate([octoAwareness.clientID]);
    applyAwarenessUpdate(yjsAwareness, octoPayload, 'remote');
    expect(yjsAwareness.getStates().get(octoAwareness.clientID)).toMatchObject({
      user: { name: 'OctoUser' },
    });

    yjsAwareness.setLocalState({
      user: { name: 'YjsUser' },
      selectionV2: {},
    });
    const yjsPayload = encodeAwarenessUpdate(yjsAwareness, [
      yjsAwareness.clientID,
    ]);
    octoAwareness.applyUpdate(yjsPayload, 'remote');
    expect(
      octoDoc.awarenessStore.getStates().get(yjsAwareness.clientID)
    ).toMatchObject({
      user: { name: 'YjsUser' },
    });

    yjsAwareness.destroy();
    yjsDoc.dispose();
    octoDoc.dispose();
  });

  test('6. Numeric encoding (Date.now() f64 vs BigInt64) & __proto__ own-key parity with Y.Doc toJSON()', () => {
    const { doc: octoDoc, store: octoStore } = createTestStore(
      'y-octo',
      'types-doc'
    );
    const pageId = octoStore.addBlock('affine:page', {});
    const surfaceId = octoStore.addBlock('affine:surface', {}, pageId);
    const elementsMap = (
      octoStore.getModelById(surfaceId)!.props as {
        elements: Boxed<Y.Map<Y.Map<unknown>>>;
      }
    ).elements.getValue()!;

    const ts = 1795241592333; // > i32::MAX, safe JS number (Date.now() scale)
    const big = BigInt('9007199254740993'); // > MAX_SAFE_INTEGER bigint
    const protoObj: Record<string, unknown> = {};
    Object.defineProperty(protoObj, '__proto__', {
      value: 'own',
      enumerable: true,
      writable: true,
      configurable: true,
    });

    octoStore.transact(() => {
      const el = new Y.Map<unknown>();
      el.set('id', 'el-types');
      el.set('type', 'shape');
      el.set('createdAt', ts);
      el.set('meta', protoObj);
      elementsMap.set('el-types', el);
    });

    // Read back from y-octo and also write a BigInt64 directly onto the live YOctoMapHandle
    const readEl = elementsMap.get('el-types')!;
    octoStore.transact(() => {
      readEl.set('bigId', big);
    });
    expect(readEl.get('createdAt')).toBe(ts);
    expect(typeof readEl.get('createdAt')).toBe('number');
    expect(readEl.get('bigId')).toBe(big);
    expect(typeof readEl.get('bigId')).toBe('bigint');

    // Sync to Y.Doc and verify createdAt is JS number (JSON.stringify succeeds without BigInt error)
    const ydoc = new Y.Doc({ guid: 'types-doc' });
    Y.applyUpdate(ydoc, encodeDocStateAsUpdate(octoDoc.spaceDoc));
    const ySurface = ydoc.getMap('blocks').get(surfaceId) as Y.Map<unknown>;
    const yBox = ySurface.get('prop:elements') as Y.Map<unknown>;
    const yElements = yBox.get('value') as Y.Map<Y.Map<unknown>>;
    const yEl = yElements.get('el-types')!;
    expect(yEl.get('createdAt')).toBe(ts);
    expect(typeof yEl.get('createdAt')).toBe('number');
    expect(yEl.get('bigId')).toBe(big);
    expect(typeof yEl.get('bigId')).toBe('bigint');

    // Separate doc with only JS number timestamp + __proto__ own-key: JSON.stringify(toJSON()) must not throw
    const { doc: jsonDoc, store: jsonStore } = createTestStore(
      'y-octo',
      'json-doc'
    );
    const jpId = jsonStore.addBlock('affine:page', {
      count: ts,
      style: protoObj,
    });
    const yJsonDoc = new Y.Doc({ guid: 'json-doc' });
    Y.applyUpdate(yJsonDoc, encodeDocStateAsUpdate(jsonDoc.spaceDoc));
    const serialized = JSON.stringify(yJsonDoc.getMap('blocks').toJSON());
    expect(serialized).toContain(String(ts));
    const yJsonBlock = yJsonDoc.getMap('blocks').get(jpId) as Y.Map<unknown>;
    expect(yJsonBlock.get('prop:count')).toBe(ts);
    expect(typeof yJsonBlock.get('prop:count')).toBe('number');

    // Direct Any map with __proto__ own key via YOctoDocSession
    const rawSession = (
      jsonDoc.spaceDoc as unknown as {
        session: YOctoDocSession;
      }
    ).session;
    const rawRoot = rawSession.ensureRoot('raw-meta', 'Map');
    rawSession.mapSet({ Identity: rawRoot }, 'obj', { Any: protoObj });
    const roundTripped = rawSession.getMapValue({ Identity: rawRoot }, 'obj');
    expect(roundTripped && 'Any' in roundTripped).toBe(true);
    const rtObj = (roundTripped as { Any: Record<string, unknown> }).Any;
    expect(Object.prototype.hasOwnProperty.call(rtObj, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(rtObj, '__proto__')?.value).toBe(
      'own'
    );

    yJsonDoc.destroy();
    jsonDoc.dispose();
    ydoc.destroy();
    octoDoc.dispose();
  });

  test('7. YOctoUndoManager.destroy() releases stack via destroyUndoStack while sibling Store view undo/redo stays intact', () => {
    const { doc, store: storeA } = createTestStore('y-octo', 'undo-destroy');
    const storeB = doc.getStore({ id: 'view-b' });
    storeB.load();

    const pageId = storeA.addBlock('affine:page', {});
    const noteId = storeA.addBlock('affine:note', {}, pageId);
    storeA.captureSync();
    storeB.captureSync();

    const p1 = storeA.addBlock(
      'affine:paragraph',
      { text: new Text('keep-me') },
      noteId
    );
    storeA.captureSync();

    expect(storeA.canUndo).toBe(true);
    expect(storeB.canUndo).toBe(true);

    // Dispose view B -> calls YOctoUndoManager.destroy() -> destroyUndoStack(stackId)
    storeB.dispose();

    // Sibling view A undo/redo still works cleanly after B's stack is destroyed
    storeA.undo();
    expect(storeA.getModelById(p1)).toBeNull();
    storeA.redo();
    expect(storeA.getModelById(p1)?.text?.toString()).toBe('keep-me');

    doc.dispose();
  });
});
