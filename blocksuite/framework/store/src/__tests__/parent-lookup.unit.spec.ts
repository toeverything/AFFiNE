import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import type { Store } from '../index.js';
import { createAutoIncrementIdGenerator } from '../test/index.js';
import { TestWorkspace } from '../test/test-workspace.js';
import {
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  RootBlockSchemaExtension,
} from './test-schema.js';

/**
 * 999.18: `getParent` searched the whole block tree from the root, and the
 * `root` getter scanned every block to find the root, on every call. Both
 * run several times per keystroke (event scope paths, selection sync) and
 * once per paragraph render, so typing on a 500-paragraph page spent about
 * a third of its time here, and re-rendering the page was quadratic.
 */

const extensions = [
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  RootBlockSchemaExtension,
];

function createStore() {
  const collection = new TestWorkspace({
    id: 'test-collection',
    idGenerator: createAutoIncrementIdGenerator(),
  });
  collection.meta.initialize();
  const doc = collection.createDoc('doc:home');
  const store = doc.getStore({ extensions });
  doc.load();
  return store;
}

function buildPage(store: Store, paragraphs: number) {
  const rootId = store.addBlock('affine:page');
  const noteA = store.addBlock('affine:note', {}, rootId);
  const noteB = store.addBlock('affine:note', {}, rootId);
  const ids = Array.from({ length: paragraphs }, () =>
    store.addBlock('affine:paragraph', {}, noteA)
  );
  return { rootId, noteA, noteB, ids };
}

const parentId = (store: Store, id: string) => store.getParent(id)?.id ?? null;

describe('parent and root lookups', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('repeated lookups do not walk the whole document', () => {
    const store = createStore();
    const { noteA, ids } = buildPage(store, 500);
    expect(parentId(store, ids[250]!)).toBe(noteA);

    const toArray = vi.spyOn(Y.Array.prototype, 'toArray');
    const forEach = vi.spyOn(Y.Map.prototype, 'forEach');
    for (const id of ids.slice(0, 200)) {
      expect(parentId(store, id)).toBe(noteA);
    }
    // The old search copied children arrays and scanned the block map on
    // every call (hundreds of times here); a cached index needs neither.
    expect(toArray.mock.calls.length).toBeLessThan(5);
    expect(forEach.mock.calls.length).toBeLessThan(5);
  });

  it('stays correct across add, move and delete', () => {
    const store = createStore();
    const { rootId, noteA, noteB, ids } = buildPage(store, 5);
    expect(store.root?.id).toBe(rootId);
    expect(parentId(store, ids[2]!)).toBe(noteA);

    const added = store.addBlock('affine:paragraph', {}, noteB);
    expect(parentId(store, added)).toBe(noteB);

    store.moveBlocks(
      [store.getModelById(ids[2]!)!],
      store.getModelById(noteB)!
    );
    expect(parentId(store, ids[2]!)).toBe(noteB);
    expect(parentId(store, ids[1]!)).toBe(noteA);

    store.deleteBlock(store.getModelById(ids[3]!)!);
    expect(store.getParent(ids[3]!)).toBeNull();
    expect(parentId(store, ids[4]!)).toBe(noteA);
    expect(parentId(store, noteA)).toBe(rootId);
    expect(store.getParent(rootId)).toBeNull();
  });

  it('stays correct when the structure changes outside the store API (remote/undo)', () => {
    const store = createStore();
    const { noteA, noteB, ids } = buildPage(store, 3);
    expect(parentId(store, ids[1]!)).toBe(noteA);

    // Simulate a remote update: move ids[1] from noteA to noteB directly on
    // the Yjs data, bypassing the store's CRUD methods.
    const yBlocks = store.doc.spaceDoc.getMap('blocks') as Y.Map<Y.Map<any>>;
    store.doc.spaceDoc.transact(() => {
      const fromChildren = yBlocks
        .get(noteA)!
        .get('sys:children') as Y.Array<string>;
      const toChildren = yBlocks
        .get(noteB)!
        .get('sys:children') as Y.Array<string>;
      fromChildren.delete(fromChildren.toArray().indexOf(ids[1]!), 1);
      toChildren.push([ids[1]!]);
    });

    expect(parentId(store, ids[1]!)).toBe(noteB);
    expect(parentId(store, ids[0]!)).toBe(noteA);
  });
});
