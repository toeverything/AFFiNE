import { describe, expect, test } from 'vitest';
import * as Y from 'yjs';

import {
  createORMClient,
  type DBSchemaBuilder,
  f,
  t,
  YjsDBAdapter,
  YOctoDBAdapter,
} from '../../orm/core';
import {
  diffUpdateV1,
  encodeStateVectorFromUpdateV1,
  ensureYOctoWasmReady,
  FORMATTING_CLEANUP_ORIGIN,
  getYOctoWasmSync,
  mergeUpdatesV1,
  revertUpdateV1,
  type SessionCommit,
  type TextDeltaOp,
  trimYOctoScratch,
  validateUpdateV1,
  YOctoDocSession,
} from '../index';

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

function normalizeDelta(ops: TextDeltaOp[]) {
  return ops.map(op => {
    if ('insert' in op) {
      return op.format && Object.keys(op.format).length > 0
        ? { insert: op.insert, attributes: op.format }
        : { insert: op.insert };
    }
    return op;
  });
}

function encodeSelectionMeta(meta: {
  storeId: string;
  range: { index: number; length: number };
}): Uint8Array {
  return utf8Encoder.encode(JSON.stringify(meta));
}

function decodeSelectionMeta(bytes: Uint8Array | null) {
  if (!bytes) return null;
  return JSON.parse(utf8Decoder.decode(bytes)) as {
    storeId: string;
    range: { index: number; length: number };
  };
}

describe('Yjs vs y-octo-wasm DocSession 6-scenario deep interop suite', () => {
  test('Scenario 1: dual-store views sharing one DocSession & single UndoManager with selection meta', async () => {
    await ensureYOctoWasmReady();

    // --- y-octo-wasm backend ---
    const session = new YOctoDocSession({
      clientId: 1001,
      guid: 'shared-page',
      captureTimeoutMs: 500,
    });
    session.advanceTime(1000);
    const bodyId = session.ensureRoot('body', 'Text');
    const bodyTarget = { Identity: bodyId };

    // View A (main page) edits + records selection meta
    const selA = { storeId: 'A', range: { index: 0, length: 6 } };
    session.transact(() => {
      session.textInsert(bodyTarget, 0, 'ViewA ');
    }, 'store-A');
    session.setUndoSelectionMeta(encodeSelectionMeta(selA));
    session.stopCapturing();

    // View B (embed-synced-doc) edits on the SAME DocSession + records selection meta
    session.advanceTime(2000);
    const selB = { storeId: 'B', range: { index: 6, length: 5 } };
    session.transact(() => {
      session.textInsert(bodyTarget, 6, 'ViewB');
    }, 'store-B');
    session.setUndoSelectionMeta(encodeSelectionMeta(selB));

    expect(session.readTextString(bodyTarget)).toBe('ViewA ViewB');

    // --- Yjs reference backend with identical operations ---
    const ydoc = new Y.Doc({ guid: 'shared-page' });
    ydoc.clientID = 1001;
    const ytext = ydoc.getText('body');
    const yUndo = new Y.UndoManager(ytext, {
      captureTimeout: 500,
      trackedOrigins: new Set(['store-A', 'store-B']),
    });
    let pendingSel: typeof selA | null = null;
    yUndo.on(
      'stack-item-added',
      (e: { stackItem: { meta: Map<any, any> } }) => {
        if (pendingSel) {
          e.stackItem.meta.set('selection', pendingSel);
          pendingSel = null;
        }
      }
    );
    const yPoppedSelections: (typeof selA | undefined)[] = [];
    yUndo.on(
      'stack-item-popped',
      (e: { stackItem: { meta: Map<any, any> } }) => {
        yPoppedSelections.push(e.stackItem.meta.get('selection'));
      }
    );

    pendingSel = selA;
    ydoc.transact(() => ytext.insert(0, 'ViewA '), 'store-A');
    yUndo.stopCapturing();

    pendingSel = selB;
    ydoc.transact(() => ytext.insert(6, 'ViewB'), 'store-B');
    expect(ytext.toString()).toBe('ViewA ViewB');

    // Undo #1 -> restores View B's edit and returns View B's selection meta
    const undo1 = session.undo();
    yUndo.undo();
    expect(session.readTextString(bodyTarget)).toBe('ViewA ');
    expect(ytext.toString()).toBe('ViewA ');
    expect(decodeSelectionMeta(undo1?.selection_meta ?? null)).toEqual(selB);
    expect(yPoppedSelections[0]).toEqual(selB);

    // Undo #2 -> restores View A's edit and returns View A's selection meta
    const undo2 = session.undo();
    yUndo.undo();
    expect(session.readTextString(bodyTarget)).toBe('');
    expect(ytext.toString()).toBe('');
    expect(decodeSelectionMeta(undo2?.selection_meta ?? null)).toEqual(selA);
    expect(yPoppedSelections[1]).toEqual(selA);

    session.destroy();
    ydoc.destroy();
  });

  test('Scenario 2: concurrent interleaved selective undo/redo + RelativePosition & toDelta() parity', () => {
    const session = new YOctoDocSession({
      clientId: 2001,
      guid: 'collab-undo',
      captureTimeoutMs: 500,
    });
    session.advanceTime(1000);
    const textTarget = { Identity: session.ensureRoot('text', 'Text') };

    // Shared initial state: "12345"
    const initCommit = session.textInsert(textTarget, 0, '12345')!;
    session.stopCapturing();

    const yPeer = new Y.Doc({ guid: 'collab-undo' });
    yPeer.clientID = 2002;
    Y.applyUpdate(yPeer, initCommit.update);

    // Local Wasm inserts "world" at offset 5
    session.advanceTime(2000);
    const localCommit = session.textApplyDelta(textTarget, [
      { retain: 5 },
      { insert: 'world', format: { bold: true } },
    ])!;
    const anchorBeforeSync = session.createRelativePosition(textTarget, 5, 0);
    const anchorEnd = session.createRelativePosition(textTarget, 10, 0);

    // Remote Yjs peer concurrently inserts "hello " at offset 0
    yPeer.getText('text').insert(0, 'hello ');
    const peerDelta = Y.encodeStateAsUpdate(yPeer, session.encodeStateVector());

    // Bidirectional exchange
    session.applyUpdate(peerDelta);
    Y.applyUpdate(yPeer, localCommit.update);

    expect(session.readTextString(textTarget)).toBe('hello 12345world');
    expect(yPeer.getText('text').toString()).toBe('hello 12345world');
    expect(normalizeDelta(session.readTextDelta(textTarget))).toEqual(
      yPeer.getText('text').toDelta()
    );

    // Verify RelativePosition resolution matches Yjs identically
    for (const rpos of [anchorBeforeSync, anchorEnd]) {
      const yAbs = Y.createAbsolutePositionFromRelativePosition(
        Y.decodeRelativePosition(rpos.bytes),
        yPeer
      );
      const wAbs = session.resolveRelativePosition(rpos.bytes, false);
      expect(wAbs?.index).toBe(yAbs?.index);
    }

    // Selective undo on Wasm: removes ONLY "world", keeping peer's "hello "
    const undoCommit = session.undo()!;
    Y.applyUpdate(yPeer, undoCommit.update);
    expect(session.readTextString(textTarget)).toBe('hello 12345');
    expect(yPeer.getText('text').toString()).toBe('hello 12345');
    expect(normalizeDelta(session.readTextDelta(textTarget))).toEqual(
      yPeer.getText('text').toDelta()
    );

    // RelativePosition still matches Yjs after undo
    const yAbsAfterUndo = Y.createAbsolutePositionFromRelativePosition(
      Y.decodeRelativePosition(anchorBeforeSync.bytes),
      yPeer
    );
    const wAbsAfterUndo = session.resolveRelativePosition(
      anchorBeforeSync.bytes,
      false
    );
    expect(wAbsAfterUndo?.index).toBe(yAbsAfterUndo?.index);

    // Redo restores "world" with bold attribute intact
    const redoCommit = session.redo()!;
    Y.applyUpdate(yPeer, redoCommit.update);
    expect(session.readTextString(textTarget)).toBe('hello 12345world');
    expect(yPeer.getText('text').toString()).toBe('hello 12345world');
    expect(normalizeDelta(session.readTextDelta(textTarget))).toEqual(
      yPeer.getText('text').toDelta()
    );

    // Stateless wire operators sanity check
    validateUpdateV1(redoCommit.update);
    const sv = encodeStateVectorFromUpdateV1(session.encodeStateAsUpdate());
    expect(sv).toEqual(Y.encodeStateVector(yPeer));
    const diff = diffUpdateV1(Y.encodeStateAsUpdate(yPeer), sv);
    validateUpdateV1(diff);
    session.applyUpdate(diff);
    expect(session.readTextString(textTarget)).toBe('hello 12345world');

    session.destroy();
    yPeer.destroy();
  });

  test('Scenario 3: auto_gc=true history snapshot revertUpdateV1(v3, v1) + concurrent edits', () => {
    const live = new Y.Doc({ gc: true, guid: 'gc-history' });
    live.clientID = 3001;
    const blocks = live.getMap('blocks');

    // v1
    const b1 = new Y.Map();
    b1.set('sys:flavour', 'affine:paragraph');
    const t1 = new Y.Text();
    t1.insert(0, 'v1 paragraph');
    b1.set('prop:text', t1);
    blocks.set('b1', b1);
    const v1 = Y.encodeStateAsUpdate(live);

    // v2: edit b1 + add b2
    t1.delete(0, 2);
    t1.insert(0, 'v2');
    const b2 = new Y.Map();
    b2.set('sys:flavour', 'affine:paragraph');
    b2.set('prop:text', new Y.Text('v2 extra'));
    blocks.set('b2', b2);
    const v2 = Y.encodeStateAsUpdate(live);

    // v3: delete b1 completely (GC tombstones it!), modify b2, add b3
    blocks.delete('b1');
    (blocks.get('b2') as Y.Map<any>).set('prop:type', 'h1');
    const b3 = new Y.Map();
    b3.set('sys:flavour', 'affine:paragraph');
    blocks.set('b3', b3);
    const v3 = Y.encodeStateAsUpdate(live);

    // Sanity check mergeUpdatesV1
    const merged = mergeUpdatesV1([v1, v2, v3]);
    validateUpdateV1(merged);

    // Online Wasm session synced to v3
    const wasmPeer = new YOctoDocSession({
      clientId: 3002,
      guid: 'gc-history',
      gc: true,
    });
    wasmPeer.applyUpdate(v3);

    // Compute revert compensation delta v3 -> v1
    const revertDelta = revertUpdateV1(v3, v1);
    validateUpdateV1(revertDelta);

    // Concurrent edit on online Yjs client before revert arrives
    const concurrentYjs = new Y.Doc({ gc: true, guid: 'gc-history' });
    concurrentYjs.clientID = 3003;
    Y.applyUpdate(concurrentYjs, v3);
    const bConcurrent = new Y.Map();
    bConcurrent.set('sys:flavour', 'affine:paragraph');
    bConcurrent.set('prop:text', new Y.Text('concurrent-keep'));
    concurrentYjs.getMap('blocks').set('b-concurrent', bConcurrent);
    const concurrentUpdate = Y.encodeStateAsUpdate(
      concurrentYjs,
      Y.encodeStateVector(live)
    );

    // Apply revert to both live Yjs and Wasm peers
    Y.applyUpdate(live, revertDelta);
    wasmPeer.applyUpdate(revertDelta);

    expect(live.getMap('blocks').has('b1')).toBe(true);
    expect(
      (
        (live.getMap('blocks').get('b1') as Y.Map<any>).get(
          'prop:text'
        ) as Y.Text
      ).toString()
    ).toBe('v1 paragraph');
    expect(live.getMap('blocks').has('b2')).toBe(false);
    expect(live.getMap('blocks').has('b3')).toBe(false);

    // Apply concurrent edit + revert in opposite orders -> exact convergence
    Y.applyUpdate(live, concurrentUpdate);
    Y.applyUpdate(concurrentYjs, revertDelta);
    wasmPeer.applyUpdate(concurrentUpdate);

    expect(live.getMap('blocks').toJSON()).toEqual(
      concurrentYjs.getMap('blocks').toJSON()
    );
    expect(live.getMap('blocks').has('b-concurrent')).toBe(true);
    expect(
      wasmPeer.getMapValue(
        { Path: { root: 'blocks', segments: [{ Key: 'b1' }] } },
        'sys:flavour'
      )
    ).toEqual({ Any: 'affine:paragraph' });
    expect(
      wasmPeer.readTextString({
        Path: {
          root: 'blocks',
          segments: [{ Key: 'b1' }, { Key: 'prop:text' }],
        },
      })
    ).toBe('v1 paragraph');
    expect(
      wasmPeer.readTextString({
        Path: {
          root: 'blocks',
          segments: [{ Key: 'b-concurrent' }, { Key: 'prop:text' }],
        },
      })
    ).toBe('concurrent-keep');

    live.destroy();
    concurrentYjs.destroy();
    wasmPeer.destroy();
  });

  test('Scenario 4: Edgeless whiteboard surface nested element path write + unknown field preservation', () => {
    const session = new YOctoDocSession({ clientId: 4001, guid: 'edgeless' });
    const blocksId = session.ensureRoot('blocks', 'Map');
    session.mapSet({ Identity: blocksId }, 'surface-1', {
      Map: [
        ['sys:flavour', { Any: 'affine:surface' }],
        [
          'prop:elements',
          {
            Map: [
              [
                'value',
                {
                  Map: [
                    [
                      'elem-1',
                      {
                        Map: [
                          ['type', { Any: 'shape' }],
                          ['xywh', { Any: '[0,0,100,100]' }],
                          ['index', { Any: 'a0' }],
                          [
                            'unknownExt',
                            { Any: { version: 9, flags: ['x', 'y'] } },
                          ],
                          [
                            'text',
                            {
                              Text: [
                                { insert: 'Node', format: { bold: true } },
                              ],
                            },
                          ],
                        ],
                      },
                    ],
                  ],
                },
              ],
            ],
          },
        ],
      ],
    });

    const elemPath = {
      root: 'blocks',
      segments: [
        { Key: 'surface-1' },
        { Key: 'prop:elements' },
        { Key: 'value' },
        { Key: 'elem-1' },
      ],
    };
    const textPath = {
      root: 'blocks',
      segments: [...elemPath.segments, { Key: 'text' }],
    };

    // Sync initial state to Yjs peer
    const yPeer = new Y.Doc({ guid: 'edgeless' });
    yPeer.clientID = 4002;
    Y.applyUpdate(yPeer, session.encodeStateAsUpdate());

    // Wasm updates coordinates + index + text
    session.transact(() => {
      session.mapSet({ Path: elemPath }, 'xywh', { Any: '[50,80,220,140]' });
      session.mapSet({ Path: elemPath }, 'index', { Any: 'a1V' });
      session.textInsert({ Path: textPath }, 4, ' #1');
    });

    // Yjs peer concurrently updates another element and reads elem-1
    const yElements = (
      (yPeer.getMap('blocks').get('surface-1') as Y.Map<any>).get(
        'prop:elements'
      ) as Y.Map<any>
    ).get('value') as Y.Map<any>;
    const yElem2 = new Y.Map();
    yElem2.set('type', 'connector');
    yElem2.set('xywh', '[10,10,50,50]');
    yElements.set('elem-2', yElem2);

    // Bidirectional sync
    const svWasm = session.encodeStateVector();
    const svYjs = Y.encodeStateVector(yPeer);
    Y.applyUpdate(yPeer, session.encodeStateAsUpdate(svYjs));
    session.applyUpdate(Y.encodeStateAsUpdate(yPeer, svWasm));

    const yElem1 = yElements.get('elem-1') as Y.Map<any>;
    expect(yElem1.get('xywh')).toBe('[50,80,220,140]');
    expect(yElem1.get('index')).toBe('a1V');
    expect(yElem1.get('unknownExt')).toEqual({
      version: 9,
      flags: ['x', 'y'],
    });
    expect((yElem1.get('text') as Y.Text).toDelta()).toEqual([
      { insert: 'Node #1', attributes: { bold: true } },
    ]);
    expect(Array.from(yElements.keys()).sort()).toEqual(['elem-1', 'elem-2']);

    // Wasm sees elem-2 and still preserves unknownExt
    expect(session.getMapValue({ Path: elemPath }, 'unknownExt')).toEqual({
      Any: { version: 9, flags: ['x', 'y'] },
    });
    expect(
      session
        .readMap({
          Path: {
            root: 'blocks',
            segments: [
              { Key: 'surface-1' },
              { Key: 'prop:elements' },
              { Key: 'value' },
            ],
          },
        })
        .map(([k]) => k)
    ).toEqual(['elem-1', 'elem-2']);

    session.destroy();
    yPeer.destroy();
  });

  test('Scenario 5: Database (Array of Maps) + Table (flat prop:cells.<r:c>.text) + ORM docProperties mixed with Yjs', () => {
    const session = new YOctoDocSession({ clientId: 5001, guid: 'db-table' });
    const blocksId = session.ensureRoot('blocks', 'Map');
    session.mapSet({ Identity: blocksId }, 'db-1', {
      Map: [
        ['sys:flavour', { Any: 'affine:database' }],
        [
          'prop:columns',
          {
            Array: [
              {
                Map: [
                  ['id', { Any: 'col-1' }],
                  ['name', { Any: 'Status' }],
                ],
              },
            ],
          },
        ],
      ],
    });
    session.mapSet({ Identity: blocksId }, 'tbl-1', {
      Map: [
        ['sys:flavour', { Any: 'affine:table' }],
        ['prop:cells.r1:c1.text', { Text: [{ insert: 'Cell 1' }] }],
      ],
    });

    const yPeer = new Y.Doc({ guid: 'db-table' });
    yPeer.clientID = 5002;
    Y.applyUpdate(yPeer, session.encodeStateAsUpdate());

    // Concurrent edits: Wasm pushes a column & edits table cell; Yjs pushes another column & edits cell
    session.arrayPush(
      {
        Path: {
          root: 'blocks',
          segments: [{ Key: 'db-1' }, { Key: 'prop:columns' }],
        },
      },
      [
        {
          Map: [
            ['id', { Any: 'col-wasm' }],
            ['name', { Any: 'Owner' }],
          ],
        },
      ]
    );
    session.textInsert(
      {
        Path: {
          root: 'blocks',
          segments: [{ Key: 'tbl-1' }, { Key: 'prop:cells.r1:c1.text' }],
        },
      },
      6,
      ' (wasm)'
    );

    const yCols = (yPeer.getMap('blocks').get('db-1') as Y.Map<any>).get(
      'prop:columns'
    ) as Y.Array<Y.Map<any>>;
    const yColNew = new Y.Map();
    yColNew.set('id', 'col-yjs');
    yColNew.set('name', 'Priority');
    yCols.push([yColNew]);
    (
      (yPeer.getMap('blocks').get('tbl-1') as Y.Map<any>).get(
        'prop:cells.r1:c1.text'
      ) as Y.Text
    ).insert(0, '[Y] ');

    const svW = session.encodeStateVector();
    const svY = Y.encodeStateVector(yPeer);
    Y.applyUpdate(yPeer, session.encodeStateAsUpdate(svY));
    session.applyUpdate(Y.encodeStateAsUpdate(yPeer, svW));

    const yColIds = yCols.toArray().map(m => m.get('id'));
    const wColIds = session
      .readArray({
        Path: {
          root: 'blocks',
          segments: [{ Key: 'db-1' }, { Key: 'prop:columns' }],
        },
      })
      .map(v => {
        if ('Map' in v) {
          const id = session.getMapValue({ Identity: v.Map }, 'id');
          return id && 'Any' in id ? id.Any : null;
        }
        return null;
      });
    expect(wColIds).toEqual(yColIds);
    expect(wColIds).toHaveLength(3);

    const yCellStr = (
      (yPeer.getMap('blocks').get('tbl-1') as Y.Map<any>).get(
        'prop:cells.r1:c1.text'
      ) as Y.Text
    ).toString();
    const wCellStr = session.readTextString({
      Path: {
        root: 'blocks',
        segments: [{ Key: 'tbl-1' }, { Key: 'prop:cells.r1:c1.text' }],
      },
    });
    expect(wCellStr).toBe(yCellStr);
    expect(wCellStr).toBe('[Y] Cell 1 (wasm)');

    // ORM docProperties bidirectional interop
    const schema = {
      docProperties: t.document({
        id: f.string().primaryKey(),
        primaryMode: f.string().optional(),
      }),
    } satisfies DBSchemaBuilder;
    const OrmClient = createORMClient(schema);
    const ormYDoc = new Y.Doc({ guid: 'db$docProperties' });
    const ormWDoc = new YOctoDocSession({ guid: 'db$docProperties' });
    const ormY = new OrmClient(
      new YjsDBAdapter(schema, { getDoc: () => ormYDoc })
    );
    const ormW = new OrmClient(
      new YOctoDBAdapter(schema, { getDoc: () => ormWDoc })
    );

    ormW.docProperties.create({
      id: 'page-1',
      primaryMode: 'page',
      customFlag: true,
    });
    ormY.docProperties.create({
      id: 'page-2',
      primaryMode: 'edgeless',
    });

    Y.applyUpdate(ormYDoc, ormWDoc.encodeStateAsUpdate());
    ormWDoc.applyUpdate(Y.encodeStateAsUpdate(ormYDoc));

    expect(ormY.docProperties.get('page-1')).toEqual({
      id: 'page-1',
      primaryMode: 'page',
      customFlag: true,
    });
    expect(ormW.docProperties.get('page-2')).toEqual({
      id: 'page-2',
      primaryMode: 'edgeless',
    });

    session.destroy();
    yPeer.destroy();
    ormWDoc.destroy();
    ormYDoc.destroy();
  });

  test('Scenario 6: smoke latency sanity for rich-text and whiteboard updates', () => {
    const session = new YOctoDocSession({ clientId: 6001, guid: 'perf-smoke' });
    const textTarget = { Identity: session.ensureRoot('text', 'Text') };
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      session.textInsert(textTarget, i, 'a');
    }
    const elapsed = performance.now() - start;
    expect(session.readTextLen(textTarget)).toBe(100);
    expect(elapsed).toBeLessThan(5000);
    session.destroy();
  });

  test('Scenario 7: YXml* bidirectional sync with Yjs + multi-stack Named undo + undo disabled mode', () => {
    // 7A. YXml* (XMLFragment / XMLElement / XMLText) bidirectional sync with Yjs
    const xmlSession = new YOctoDocSession({
      clientId: 7001,
      guid: 'xml-sync',
    });
    const fragId = xmlSession.ensureRoot('prosemirror', 'XMLFragment');
    xmlSession.arrayPush({ Identity: fragId }, [
      {
        XmlElement: {
          tag: 'paragraph',
          attrs: [
            ['align', 'left'],
            ['level', 1],
          ],
          children: [
            {
              XmlText: [{ insert: 'Hello XML', format: { bold: true } }],
            },
          ],
        },
      },
    ]);

    const elemPath = {
      root: 'prosemirror',
      segments: [{ Index: 0 }],
    };
    expect(xmlSession.xmlName({ Path: elemPath })).toBe('paragraph');
    expect(xmlSession.xmlGetAttr({ Path: elemPath }, 'align')).toBe('left');
    xmlSession.xmlSetAttr({ Path: elemPath }, 'align', 'center');
    expect(xmlSession.xmlGetAttr({ Path: elemPath }, 'align')).toBe('center');
    xmlSession.xmlRemoveAttr({ Path: elemPath }, 'level');
    expect(xmlSession.xmlGetAttr({ Path: elemPath }, 'level')).toBe(null);
    expect(xmlSession.xmlAttrs({ Path: elemPath })).toEqual([
      ['align', 'center'],
    ]);
    expect(xmlSession.xmlToString({ Path: elemPath })).toContain(
      '<paragraph align="center">'
    );

    // Sync to Yjs and verify Y.XmlFragment / Y.XmlElement / Y.XmlText
    const yXmlDoc = new Y.Doc({ guid: 'xml-sync' });
    yXmlDoc.clientID = 7002;
    Y.applyUpdate(yXmlDoc, xmlSession.encodeStateAsUpdate());

    const yFrag = yXmlDoc.getXmlFragment('prosemirror');
    expect(yFrag.length).toBe(1);
    const yPara = yFrag.get(0) as Y.XmlElement;
    expect(yPara.nodeName).toBe('paragraph');
    expect(yPara.getAttribute('align')).toBe('center');
    expect(yPara.getAttribute('level')).toBeUndefined();
    const yXmlTxt = yPara.get(0) as Y.XmlText;
    expect(yXmlTxt.toDelta()).toEqual([
      { insert: 'Hello XML', attributes: { bold: true } },
    ]);

    // Reverse edit from Yjs -> y-octo-wasm
    yPara.setAttribute('dir', 'rtl');
    yXmlTxt.insert(9, '!');
    xmlSession.applyUpdate(
      Y.encodeStateAsUpdate(yXmlDoc, xmlSession.encodeStateVector())
    );
    expect(xmlSession.xmlGetAttr({ Path: elemPath }, 'dir')).toBe('rtl');
    expect(
      xmlSession.readTextString({
        Path: { root: 'prosemirror', segments: [{ Index: 0 }, { Index: 0 }] },
      })
    ).toBe('Hello XML!');

    xmlSession.destroy();
    yXmlDoc.destroy();

    // 7B. Multi-stack independent Undo with Named origins + Uint8Array selection_meta
    const multi = new YOctoDocSession({
      clientId: 7003,
      guid: 'multi-stack',
      undo: 'custom',
    });
    multi.advanceTime(1000);
    const textA = { Identity: multi.ensureRoot('docA', 'Text') };
    const textB = { Identity: multi.ensureRoot('docB', 'Text') };

    const stackA = multi.createUndoStack([textA], 500, [{ Named: 'editor-A' }]);
    const stackB = multi.createUndoStack([textB], 500, [{ Named: 'editor-B' }]);

    const cA = multi.transact(
      () => {
        multi.textInsert(textA, 0, 'Alpha');
      },
      'js-A',
      { Named: 'editor-A' }
    ).commit!;
    expect(cA.origin_kind).toEqual({ LocalNamed: 'editor-A' });
    const metaA = encodeSelectionMeta({
      storeId: 'A',
      range: { index: 0, length: 5 },
    });
    expect(multi.setStackSelectionMeta(stackA, 'Undo', metaA)).toBe(true);

    const cB = multi.transact(
      () => {
        multi.textInsert(textB, 0, 'Beta');
      },
      'js-B',
      { Named: 'editor-B' }
    ).commit!;
    expect(cB.origin_kind).toEqual({ LocalNamed: 'editor-B' });
    const metaB = encodeSelectionMeta({
      storeId: 'B',
      range: { index: 0, length: 4 },
    });
    expect(multi.setStackSelectionMeta(stackB, 'Undo', metaB)).toBe(true);

    expect(multi.canUndoStack(stackA)).toBe(true);
    expect(multi.canUndoStack(stackB)).toBe(true);

    // Undo stackA ONLY -> textB remains untouched!
    const uA = multi.undoStack(stackA)!;
    expect(uA.origin_kind).toEqual({ Undo: { stack_id: stackA } });
    expect(uA.selection_meta).toBeInstanceOf(Uint8Array);
    expect(decodeSelectionMeta(uA.selection_meta)).toEqual({
      storeId: 'A',
      range: { index: 0, length: 5 },
    });
    expect(multi.readTextString(textA)).toBe('');
    expect(multi.readTextString(textB)).toBe('Beta');

    // Redo stackA
    const rA = multi.redoStack(stackA)!;
    expect(rA.origin_kind).toEqual({ Redo: { stack_id: stackA } });
    expect(multi.readTextString(textA)).toBe('Alpha');

    // Undo stackB
    const uB = multi.undoStack(stackB)!;
    expect(uB.origin_kind).toEqual({ Undo: { stack_id: stackB } });
    expect(decodeSelectionMeta(uB.selection_meta)).toEqual({
      storeId: 'B',
      range: { index: 0, length: 4 },
    });
    expect(multi.readTextString(textB)).toBe('');

    multi.destroy();

    // 7C. undo: 'disabled' zero-history mode (used by ORM metadata tables)
    const noUndo = new YOctoDocSession({
      clientId: 7004,
      guid: 'orm-no-undo',
      undo: 'disabled',
    });
    const rowId = noUndo.ensureRoot('row-1', 'Map');
    noUndo.mapSet({ Identity: rowId }, 'name', { Any: 'tag-1' });
    expect(noUndo.canUndo()).toBe(false);
    expect(noUndo.canRedo()).toBe(false);
    expect(noUndo.undo()).toBe(null);
    expect(noUndo.getMapValue({ Identity: rowId }, 'name')).toEqual({
      Any: 'tag-1',
    });
    noUndo.destroy();
  });

  test('Scenario 8: ABI v1 invariants (version, re-entrant getter + deferred trimScratch, BOM, Any:undefined, destroyUndoStack, FormattingCleanup)', async () => {
    const exp = await ensureYOctoWasmReady();
    expect(exp.wasm_abi_version()).toBe(1);
    expect(getYOctoWasmSync().wasm_abi_version()).toBe(1);

    // 8A. Re-entrant getter reading session + deferred trimScratch + U+FEFF BOM + { Any: undefined }
    const session = new YOctoDocSession({
      clientId: 8001,
      guid: 'abi-v1-reentrant',
      undo: 'custom',
    });
    const mapId = session.ensureRoot('data', 'Map');
    const mapTarget = { Identity: mapId };
    session.mapSet(mapTarget, 'seed', { Any: 'ok' });

    const bomStr = '\uFEFFleading-bom';
    let reentrantRead: unknown = null;
    const payload: Record<string, unknown> = {
      bom: bomStr,
      ts: 1795241592333,
      big: BigInt('9007199254740993'),
    };
    Object.defineProperty(payload, '__proto__', {
      value: 'own-proto',
      enumerable: true,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(payload, 'dynamic', {
      enumerable: true,
      get() {
        // Trigger nested Wasm call + deferred trimScratch mid-encoding
        reentrantRead = session.getMapValue(mapTarget, 'seed');
        trimYOctoScratch();
        const merged = mergeUpdatesV1([session.encodeUpdateV1()]);
        return merged.byteLength > 0 ? 'nested-ok' : 'nested-empty';
      },
    });

    session.mapSet(mapTarget, 'nested', { Any: payload });
    session.mapSet(mapTarget, 'undef', { Any: undefined });
    session.mapSet(mapTarget, 'bomKey', { Any: bomStr });

    expect(reentrantRead).toEqual({ Any: 'ok' });
    expect(session.getMapValue(mapTarget, 'bomKey')).toEqual({ Any: bomStr });
    expect(session.getMapValue(mapTarget, 'undef')).toEqual({ Any: undefined });
    const nestedRead = session.getMapValue(mapTarget, 'nested') as {
      Any: Record<string, unknown>;
    };
    expect(nestedRead.Any.bom).toBe(bomStr);
    expect(nestedRead.Any.dynamic).toBe('nested-ok');
    expect(nestedRead.Any.ts).toBe(1795241592333);
    expect(typeof nestedRead.Any.ts).toBe('number');
    expect(nestedRead.Any.big).toBe(BigInt('9007199254740993'));
    expect(typeof nestedRead.Any.big).toBe('bigint');
    expect(Object.hasOwn(nestedRead.Any, '__proto__')).toBe(true);
    expect(
      Object.getOwnPropertyDescriptor(nestedRead.Any, '__proto__')?.value
    ).toBe('own-proto');

    // 8B. destroyUndoStack frees target stack while keeping sibling stack functional
    const tA = { Identity: session.ensureRoot('tA', 'Text') };
    const tB = { Identity: session.ensureRoot('tB', 'Text') };
    const sA = session.createUndoStack([tA], 500, ['Tracked']);
    const sB = session.createUndoStack([tB], 500, ['Tracked']);
    session.advanceTime(1000);
    session.transact(() => {
      session.textInsert(tA, 0, 'AAA');
      session.textInsert(tB, 0, 'BBB');
    });
    expect(session.canUndoStack(sA)).toBe(true);
    expect(session.canUndoStack(sB)).toBe(true);
    expect(session.destroyUndoStack(sA)).toBe(true);
    expect(session.destroyUndoStack(sA)).toBe(false);
    // Sibling stack sB still undoes/redoes cleanly
    expect(session.canUndoStack(sB)).toBe(true);
    session.undoStack(sB);
    expect(session.readTextString(tB)).toBe('');
    expect(session.readTextString(tA)).toBe('AAA');
    session.redoStack(sB);
    expect(session.readTextString(tB)).toBe('BBB');
    session.destroy();

    // 8C. Remote update triggering FormattingCleanup emits separate local commit with FORMATTING_CLEANUP_ORIGIN
    const peerA = new YOctoDocSession({
      clientId: 8101,
      guid: 'fmt-cleanup',
      undo: 'custom',
    });
    const peerB = new Y.Doc({ guid: 'fmt-cleanup' });
    peerB.clientID = 8102;

    const textA = { Identity: peerA.ensureRoot('rich', 'Text') };
    peerA.textInsert(textA, 0, 'abcd');
    peerA.textFormat(textA, 0, 4, { bold: true });
    Y.applyUpdate(peerB, peerA.encodeUpdateV1());

    // Concurrently: peerA formats [1, 3) bold:true again? Even simpler:
    // peerA deletes 'bc' while peerB formats 'bc' bold:true -> overlapping redundant format markers
    const svCommon = peerA.encodeStateVectorV1();
    peerA.textRemove(textA, 1, 2);
    peerB.transact(() => {
      peerB.getText('rich').format(0, 4, { italic: true });
      peerB.getText('rich').format(1, 2, { bold: null });
    });

    const emitted: Array<{ origin: unknown; commit: SessionCommit }> = [];
    peerA.on('update', (_u, origin, _doc, commit) => {
      emitted.push({ origin, commit });
    });

    const remoteFromB = Y.encodeStateAsUpdate(peerB, svCommon);
    const commits = peerA.applyUpdateAll(remoteFromB, 'remote-peer-b');
    expect(commits.length).toBeGreaterThanOrEqual(1);
    for (const item of emitted) {
      if (item.commit.origin_kind === 'FormattingCleanup') {
        expect(item.commit.is_local).toBe(true);
        expect(item.origin).toBe(FORMATTING_CLEANUP_ORIGIN);
      } else {
        expect(item.origin).toBe('remote-peer-b');
      }
    }

    // Converge both peers
    Y.applyUpdate(peerB, peerA.encodeDiffV1(Y.encodeStateVector(peerB)));
    peerA.applyUpdateAll(
      Y.encodeStateAsUpdate(peerB, peerA.encodeStateVectorV1()),
      'remote-peer-b'
    );
    const coalesceTextDelta = (ops: ReadonlyArray<Record<string, unknown>>) => {
      const out: Array<{
        insert?: unknown;
        attributes?: Record<string, unknown>;
      }> = [];
      for (const op of ops) {
        const prev = out[out.length - 1];
        const attrs =
          op.attributes && typeof op.attributes === 'object'
            ? (op.attributes as Record<string, unknown>)
            : undefined;
        if (
          prev &&
          typeof prev.insert === 'string' &&
          typeof op.insert === 'string' &&
          JSON.stringify(prev.attributes ?? null) ===
            JSON.stringify(attrs ?? null)
        ) {
          prev.insert += op.insert;
        } else {
          out.push(
            attrs
              ? { insert: op.insert, attributes: { ...attrs } }
              : { insert: op.insert }
          );
        }
      }
      return out;
    };
    expect(peerA.readTextString(textA)).toBe('ad');
    expect(peerB.getText('rich').toString()).toBe('ad');
    expect(
      coalesceTextDelta(normalizeDelta(peerA.readTextDelta(textA)))
    ).toEqual(coalesceTextDelta(peerB.getText('rich').toDelta()));

    peerB.destroy();
    peerA.destroy();
  });
});
