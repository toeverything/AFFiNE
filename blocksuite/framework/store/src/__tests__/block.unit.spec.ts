import { computed, effect } from '@preact/signals-core';
import { describe, expect, test, vi } from 'vitest';
import * as Y from 'yjs';

import { BlockSchemaExtension } from '../extension/schema.js';
import {
  Block,
  BlockModel,
  defineBlockSchema,
  internalPrimitives,
} from '../model/block/index.js';
import type { YBlock } from '../model/block/types.js';
import type { Text } from '../reactive/text/index.js';
import { createAutoIncrementIdGenerator } from '../test/index.js';
import { TestWorkspace } from '../test/test-workspace.js';

const pageSchema = defineBlockSchema({
  flavour: 'page',
  props: internal => ({
    title: internal.Text(),
    count: 0,
    toggle: false,
    style: {} as Record<string, unknown>,
    boxed: internal.Boxed(new Y.Map()),
  }),
  metadata: {
    role: 'root',
    version: 1,
  },
});
const pageSchemaExtension = BlockSchemaExtension(pageSchema);

const tableSchema = defineBlockSchema({
  flavour: 'table',
  props: () => ({
    cols: {} as Record<string, { color: string }>,
    rows: [] as Array<{ color: string }>,
  }),
  metadata: {
    role: 'content',
    version: 1,
  },
});
const tableSchemaExtension = BlockSchemaExtension(tableSchema);

const flatTableSchema = defineBlockSchema({
  flavour: 'flat-table',
  props: internal => ({
    title: internal.Text(),
    cols: { internal: { color: 'white' } } as Record<string, { color: string }>,
    textCols: {} as Record<string, Text>,
    rows: {} as Record<string, { color: string }>,
    labels: [] as Array<string>,
    optional: undefined as string | undefined,
  }),
  metadata: {
    role: 'content',
    version: 1,
    isFlatData: true,
  },
});
const flatTableSchemaExtension = BlockSchemaExtension(flatTableSchema);

class RootModel extends BlockModel<
  ReturnType<(typeof pageSchema)['model']['props']>
> {}
class TableModel extends BlockModel<
  ReturnType<(typeof tableSchema)['model']['props']>
> {}
class FlatTableModel extends BlockModel<
  ReturnType<(typeof flatTableSchema)['model']['props']>
> {}

function createTestOptions() {
  const idGenerator = createAutoIncrementIdGenerator();
  return { id: 'test-collection', idGenerator };
}

const defaultDocId = 'doc:home';
function createTestDoc(docId = defaultDocId) {
  const options = createTestOptions();
  const collection = new TestWorkspace(options);
  collection.meta.initialize();
  const doc = collection.createDoc(docId);
  doc.load();
  const store = doc.getStore({
    extensions: [
      pageSchemaExtension,
      tableSchemaExtension,
      flatTableSchemaExtension,
    ],
  });
  return store;
}

test('two independent Block wrappers over the same yBlock settle on an object-valued prop write, without looping', () => {
  // Regression: `native2Y`/`y2Native` always mint a brand-new Y/JS
  // structure on every round-trip, even for identical content, so the
  // write-back `effect()` in `SyncController._createModel` could never
  // detect "this incoming value is already what's stored" for object or
  // array-valued props using reference equality alone — only primitives,
  // which `native2Y` returns unchanged, benefited from that check. A
  // single `SyncController` masks this (its own `_mutex`/`_byPassProxy`
  // guard against its own write-back effect cascading into itself), but
  // two independent `SyncController`s wrapping the *same* underlying block
  // (exactly what happens when the same block is rendered through 2+
  // simultaneous `Store` views at once, e.g. a table appearing more than
  // once on a page) have no such protection *between* them: A's
  // "redundant" write triggers B's own write-back, which triggers A's
  // again, forever — confirmed live as an actual "Cycle detected" crash
  // after 100+ synchronous re-entrant writes, with byte-identical content
  // captured across dozens of consecutive writes right before it. The
  // fix is a value-based (not reference-based) check before ever minting
  // a new Y structure or writing.
  const doc = createTestDoc();
  const yDoc = new Y.Doc();
  const yBlock = yDoc.getMap('yBlock') as YBlock;
  yBlock.set('sys:id', '0');
  yBlock.set('sys:flavour', 'table');
  yBlock.set('sys:children', new Y.Array());

  const blockA = new Block(doc.schema, yBlock, doc);
  const blockB = new Block(doc.schema, yBlock, doc);
  const modelA = blockA.model as TableModel;
  const modelB = blockB.model as TableModel;

  let writeCount = 0;
  yBlock.observe(event => {
    if (event.keysChanged.has('prop:cols')) writeCount++;
  });

  modelA.props.cols = { a: { color: 'red' } };

  // A healthy settle is a small, bounded handful of writes (the initial
  // write plus each side syncing its own local copy once) — not hundreds.
  expect(writeCount).toBeLessThan(10);
  expect(modelA.props.cols).toEqual({ a: { color: 'red' } });
  expect(modelB.props.cols).toEqual({ a: { color: 'red' } });
});

test('two independent Block wrappers with per-instance materialize-style write-back effects settle without looping', () => {
  // Same regression as above, but reproducing the actual shape of the real
  // bug: Kanban/Table's `materializeColumns` is a *reactive* consumer that,
  // on every change to the shared prop, recomputes a "normalized" value and
  // writes it back — exactly like each of the two independent effects
  // installed below. Without a value-based dedup in the write-back path,
  // this pair keeps re-triggering each other indefinitely, since neither
  // ever produces a byte-identical *object* to what's already stored, only
  // byte-identical *content*.
  const doc = createTestDoc();
  const yDoc = new Y.Doc();
  const yBlock = yDoc.getMap('yBlock') as YBlock;
  yBlock.set('sys:id', '0');
  yBlock.set('sys:flavour', 'table');
  yBlock.set('sys:children', new Y.Array());

  const blockA = new Block(doc.schema, yBlock, doc);
  const blockB = new Block(doc.schema, yBlock, doc);
  const modelA = blockA.model as TableModel;
  const modelB = blockB.model as TableModel;

  let writeCount = 0;
  yBlock.observe(event => {
    if (event.keysChanged.has('prop:cols')) writeCount++;
  });

  const installMaterializer = (model: TableModel) => {
    effect(() => {
      const current = model.props.cols$.value;
      // Deliberately rebuilds a fresh object every time it reacts —
      // mirroring `materializeColumnsByPropertyIds`, which always
      // constructs a new array/object even when the *content* it produces
      // is identical to what's already there.
      model.props.cols = Object.fromEntries(Object.entries(current));
    });
  };
  installMaterializer(modelA);
  installMaterializer(modelB);

  modelA.props.cols = { a: { color: 'red' } };

  expect(writeCount).toBeLessThan(20);
  expect(modelA.props.cols).toEqual({ a: { color: 'red' } });
  expect(modelB.props.cols).toEqual({ a: { color: 'red' } });
});

test('an in-place mutation (splice) on a shared array-valued prop notifies every independent Block wrapper', () => {
  // Regression: `createYProxy` (`reactive/proxy.ts`) caches one reactive
  // wrapper per underlying Y structure (`proxies` WeakMap,
  // `reactive/memory.ts`) — the first `SyncController` to wrap a given
  // array/map "wins" and gets its `onChange` baked in at construction;
  // every other `SyncController` wrapping the *same* structure (e.g. a
  // second, independent `Block`/model for the same underlying block —
  // exactly what happens when a block is rendered through 2+ simultaneous
  // `Store` views, as with a table appearing more than once on a page) got
  // back the same proxy object but had its own `onChange` silently
  // dropped. In-place mutations on that structure — `.splice()`, `.push()`,
  // etc., which never touch the *top-level* prop key at all, only its
  // nested Y content — are exactly how `addProperty`
  // (`blocks/database/src/utils/block-utils.ts`) adds a new database
  // column: `model.props.columns.splice(index, 0, col)`. Only the
  // `SyncController` that won the cache race ever saw such a mutation;
  // every other one's own `columns$` signal (hence anything reactively
  // derived from it, like a Table view's header list) silently stayed
  // stale until an unrelated *wholesale* reassignment of the same prop (a
  // different, correctly-broadcasting path) happened to drag it along —
  // matching the exact live symptom this was diagnosed from: a new
  // Kanban-created column not appearing in a simultaneously-rendered Table
  // view until some other edit or a reload.
  const doc = createTestDoc();
  const yDoc = new Y.Doc();
  const yBlock = yDoc.getMap('yBlock') as YBlock;
  yBlock.set('sys:id', '0');
  yBlock.set('sys:flavour', 'table');
  yBlock.set('sys:children', new Y.Array());

  const blockA = new Block(doc.schema, yBlock, doc);
  const blockB = new Block(doc.schema, yBlock, doc);
  const modelA = blockA.model as TableModel;
  const modelB = blockB.model as TableModel;

  // Establish a real value first (an empty array's `.splice()` insert is
  // exercised either way, but this mirrors the live repro more closely:
  // there's already a "title" row before a new one gets appended).
  modelA.props.rows = [{ color: 'white' }];

  const rowsUpdatesOnA: unknown[] = [];
  const rowsUpdatesOnB: unknown[] = [];
  effect(() => {
    rowsUpdatesOnA.push(modelA.props.rows$.value);
  });
  effect(() => {
    rowsUpdatesOnB.push(modelB.props.rows$.value);
  });
  const countBeforeA = rowsUpdatesOnA.length;
  const countBeforeB = rowsUpdatesOnB.length;

  // The in-place mutation `addProperty` actually uses — never reassigns
  // `model.props.rows` wholesale, just splices the existing array proxy.
  modelB.props.rows.splice(1, 0, { color: 'blue' });

  expect(modelA.props.rows).toEqual([{ color: 'white' }, { color: 'blue' }]);
  expect(modelB.props.rows).toEqual([{ color: 'white' }, { color: 'blue' }]);
  // Both sides' own signal must have actually re-fired — not just the one
  // that happened to own the underlying reactive wrapper.
  expect(rowsUpdatesOnA.length).toBeGreaterThan(countBeforeA);
  expect(rowsUpdatesOnB.length).toBeGreaterThan(countBeforeB);
});

test('init block without props should add default props', () => {
  const doc = createTestDoc();
  const yDoc = new Y.Doc();
  const yBlock = yDoc.getMap('yBlock') as YBlock;
  yBlock.set('sys:id', '0');
  yBlock.set('sys:flavour', 'page');
  yBlock.set('sys:children', new Y.Array());

  const block = new Block(doc.schema, yBlock, doc);
  const model = block.model as RootModel;

  expect(yBlock.get('prop:count')).toBe(0);
  expect(model.props.count).toBe(0);
  expect(model.props.style).toEqual({});
});

describe('block model should has signal props', () => {
  test('atom', () => {
    const doc = createTestDoc();
    const yDoc = new Y.Doc();
    const yBlock = yDoc.getMap('yBlock') as YBlock;
    yBlock.set('sys:id', '0');
    yBlock.set('sys:flavour', 'page');
    yBlock.set('sys:children', new Y.Array());

    const block = new Block(doc.schema, yBlock, doc);
    const model = block.model as RootModel;

    const isOdd = computed(() => model.props.count$.value % 2 === 1);

    expect(model.props.count$.value).toBe(0);
    expect(isOdd.peek()).toBe(false);

    // set prop
    model.props.count = 1;
    expect(model.props.count$.value).toBe(1);
    expect(isOdd.peek()).toBe(true);
    expect(yBlock.get('prop:count')).toBe(1);

    // set signal
    model.props.count$.value = 2;
    expect(model.props.count).toBe(2);
    expect(isOdd.peek()).toBe(false);
    expect(yBlock.get('prop:count')).toBe(2);

    // set prop
    yBlock.set('prop:count', 3);
    expect(model.props.count).toBe(3);
    expect(model.props.count$.value).toBe(3);
    expect(isOdd.peek()).toBe(true);

    const toggleEffect = vi.fn();
    effect(() => {
      toggleEffect(model.props.toggle$.value);
    });
    expect(toggleEffect).toHaveBeenCalledTimes(1);
    const runToggle = () => {
      const next = !model.props.toggle;
      model.props.toggle = next;
      expect(model.props.toggle$.value).toBe(next);
    };
    const times = 10;
    for (let i = 0; i < times; i++) {
      runToggle();
    }
    expect(toggleEffect).toHaveBeenCalledTimes(times + 1);
    const runToggleReverse = () => {
      const next = !model.props.toggle;
      model.props.toggle$.value = next;
      expect(model.props.toggle).toBe(next);
    };
    for (let i = 0; i < times; i++) {
      runToggleReverse();
    }
    expect(toggleEffect).toHaveBeenCalledTimes(times * 2 + 1);
  });

  test('nested', () => {
    const doc = createTestDoc();
    const yDoc = new Y.Doc();
    const yBlock = yDoc.getMap('yBlock') as YBlock;
    yBlock.set('sys:id', '0');
    yBlock.set('sys:flavour', 'page');
    yBlock.set('sys:children', new Y.Array());

    const block = new Block(doc.schema, yBlock, doc);
    const model = block.model as RootModel;
    expect(model.props.style).toEqual({});

    model.props.style = { color: 'red' };
    expect((yBlock.get('prop:style') as Y.Map<unknown>).toJSON()).toEqual({
      color: 'red',
    });
    expect(model.props.style$.value).toEqual({ color: 'red' });

    model.props.style.color = 'yellow';
    expect((yBlock.get('prop:style') as Y.Map<unknown>).toJSON()).toEqual({
      color: 'yellow',
    });
    expect(model.props.style$.value).toEqual({ color: 'yellow' });

    model.props.style$.value = { color: 'blue' };
    expect(model.props.style.color).toBe('blue');
    expect((yBlock.get('prop:style') as Y.Map<unknown>).toJSON()).toEqual({
      color: 'blue',
    });

    const map = new Y.Map();
    map.set('color', 'green');
    yBlock.set('prop:style', map);
    expect(model.props.style.color).toBe('green');
    expect(model.props.style$.value).toEqual({ color: 'green' });
  });

  test('with stash and pop', () => {
    const doc = createTestDoc();
    const yDoc = new Y.Doc();
    const yBlock = yDoc.getMap('yBlock') as YBlock;
    yBlock.set('sys:id', '0');
    yBlock.set('sys:flavour', 'page');
    yBlock.set('sys:children', new Y.Array());

    const onChange = vi.fn();
    const block = new Block(doc.schema, yBlock, doc, { onChange });
    const model = block.model as RootModel;

    expect(model.props.count).toBe(0);
    model.stash('count');

    onChange.mockClear();
    model.props.count = 1;
    expect(model.props.count$.value).toBe(1);
    expect(yBlock.get('prop:count')).toBe(0);
    expect(onChange).toHaveBeenCalledTimes(1);

    model.props.count$.value = 2;
    expect(model.props.count).toBe(2);
    expect(yBlock.get('prop:count')).toBe(0);
    expect(onChange).toHaveBeenCalledTimes(2);

    model.pop('count');
    expect(yBlock.get('prop:count')).toBe(2);
    expect(model.props.count).toBe(2);
    expect(model.props.count$.value).toBe(2);
    expect(onChange).toHaveBeenCalledTimes(3);

    model.stash('count');
    yBlock.set('prop:count', 3);
    expect(model.props.count).toBe(3);
    expect(model.props.count$.value).toBe(3);

    model.props.count$.value = 4;
    expect(yBlock.get('prop:count')).toBe(3);
    expect(model.props.count).toBe(4);

    model.pop('count');
    expect(yBlock.get('prop:count')).toBe(4);
  });
});

test('on change', () => {
  const doc = createTestDoc();
  const yDoc = new Y.Doc();
  const yBlock = yDoc.getMap('yBlock') as YBlock;
  yBlock.set('sys:id', '0');
  yBlock.set('sys:flavour', 'page');
  yBlock.set('sys:children', new Y.Array());

  const onPropsUpdated = vi.fn();
  const block = new Block(doc.schema, yBlock, doc, {
    onChange: onPropsUpdated,
  });
  const model = block.model as RootModel;

  model.props.title = internalPrimitives.Text('abc');
  expect(onPropsUpdated).toHaveBeenCalledWith(expect.anything(), 'title', true);
  expect(model.props.title$.value.toDelta()).toEqual([{ insert: 'abc' }]);

  onPropsUpdated.mockClear();

  model.props.title.insert('d', 1);
  expect(onPropsUpdated).toHaveBeenCalledWith(expect.anything(), 'title', true);

  expect(model.props.title$.value.toDelta()).toEqual([{ insert: 'adbc' }]);

  onPropsUpdated.mockClear();

  model.props.boxed.getValue()!.set('foo', 0);
  expect(onPropsUpdated).toHaveBeenCalledWith(expect.anything(), 'boxed', true);
  expect(model.props.boxed$.value.getValue()!.toJSON()).toEqual({
    foo: 0,
  });
});

test('deep sync', () => {
  const doc = createTestDoc();
  const yDoc = new Y.Doc();
  const yBlock = yDoc.getMap('yBlock') as YBlock;
  yBlock.set('sys:id', '0');
  yBlock.set('sys:flavour', 'table');
  yBlock.set('sys:children', new Y.Array());

  const onPropsUpdated = vi.fn();
  const block = new Block(doc.schema, yBlock, doc, {
    onChange: onPropsUpdated,
  });
  const model = block.model as TableModel;
  expect(model.props.cols).toEqual({});
  expect(model.props.rows).toEqual([]);

  model.props.cols = {
    '1': { color: 'red' },
  };
  const onColsUpdated = vi.fn();
  const onRowsUpdated = vi.fn();
  effect(() => {
    onColsUpdated(model.props.cols$.value);
  });
  effect(() => {
    onRowsUpdated(model.props.rows$.value);
  });
  const getColsMap = () => yBlock.get('prop:cols') as Y.Map<unknown>;
  const getRowsArr = () => yBlock.get('prop:rows') as Y.Array<unknown>;
  expect(getColsMap().toJSON()).toEqual({
    '1': { color: 'red' },
  });
  expect(model.props.cols$.value).toEqual({
    '1': { color: 'red' },
  });

  onPropsUpdated.mockClear();
  onColsUpdated.mockClear();

  model.props.cols['2'] = { color: 'blue' };
  expect(getColsMap().toJSON()).toEqual({
    '1': { color: 'red' },
    '2': { color: 'blue' },
  });
  expect(onColsUpdated).toHaveBeenCalledWith({
    '1': { color: 'red' },
    '2': { color: 'blue' },
  });
  expect(onPropsUpdated).toHaveBeenCalledTimes(1);
  expect(onColsUpdated).toHaveBeenCalledTimes(1);

  onPropsUpdated.mockClear();
  onColsUpdated.mockClear();

  const map = new Y.Map();
  map.set('color', 'green');
  getColsMap().set('3', map);
  expect(onPropsUpdated).toHaveBeenCalledWith(expect.anything(), 'cols', true);
  expect(onColsUpdated).toHaveBeenCalledWith({
    '1': { color: 'red' },
    '2': { color: 'blue' },
    '3': { color: 'green' },
  });
  expect(onPropsUpdated).toHaveBeenCalledTimes(1);
  expect(onColsUpdated).toHaveBeenCalledTimes(1);

  onPropsUpdated.mockClear();
  onRowsUpdated.mockClear();

  model.props.rows.push({ color: 'yellow' });
  expect(onPropsUpdated).toHaveBeenCalledWith(expect.anything(), 'rows', true);
  expect(onRowsUpdated).toHaveBeenCalledWith([{ color: 'yellow' }]);
  expect(onPropsUpdated).toHaveBeenCalledTimes(1);
  expect(onRowsUpdated).toHaveBeenCalledTimes(1);

  onPropsUpdated.mockClear();
  onRowsUpdated.mockClear();

  const row1 = getRowsArr().get(0) as Y.Map<string>;
  row1.set('color', 'green');
  expect(onRowsUpdated).toHaveBeenCalledWith([{ color: 'green' }]);
  expect(onPropsUpdated).toHaveBeenCalledWith(expect.anything(), 'rows', true);
  expect(model.props.rows$.value).toEqual([{ color: 'green' }]);
  expect(onPropsUpdated).toHaveBeenCalledTimes(1);
  expect(onRowsUpdated).toHaveBeenCalledTimes(1);
});

describe('flat', () => {
  test('flat crud', async () => {
    const doc = createTestDoc();
    const yDoc = new Y.Doc();
    const yBlock = yDoc.getMap('yBlock') as YBlock;
    yBlock.set('sys:id', '0');
    yBlock.set('sys:flavour', 'flat-table');
    yBlock.set('sys:children', new Y.Array());

    const onChange = vi.fn();
    const onColUpdated = vi.fn();

    const block = new Block(doc.schema, yBlock, doc, { onChange });
    const model = block.model as FlatTableModel;
    model.props.title = internalPrimitives.Text();

    model.props.cols$.subscribe(onColUpdated);
    onChange.mockClear();
    onColUpdated.mockClear();

    model.props.cols = {
      ...model.props.cols,
      a: { color: 'red' },
    };
    expect(onColUpdated).toHaveBeenCalledTimes(1);
    expect(yBlock.get('prop:cols.a.color')).toBe('red');
    expect(yBlock.get('prop:cols.internal.color')).toBe('white');
    expect(onChange).toHaveBeenCalledTimes(1);

    onChange.mockClear();
    onColUpdated.mockClear();
    model.props.cols.b = { color: 'blue' };
    expect(yBlock.get('prop:cols.b.color')).toBe('blue');
    expect(model.props.cols$.peek()).toEqual({
      a: { color: 'red' },
      b: { color: 'blue' },
      internal: { color: 'white' },
    });
    expect(onColUpdated).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.anything(), 'cols', true);

    model.props.cols.a.color = 'black';
    expect(yBlock.get('prop:cols.a.color')).toBe('black');
    expect(model.props.cols$.value.a.color).toBe('black');

    onChange.mockClear();
    onColUpdated.mockClear();
    model.props.cols$.value = {
      a: { color: 'red' },
    };
    expect(yBlock.get('prop:cols.a.color')).toBe('red');
    expect(yBlock.get('prop:cols.internal.color')).toBe(undefined);
    expect(yBlock.get('prop:cols.b.color')).toBe(undefined);
    expect(model.props.cols).toEqual({
      a: { color: 'red' },
    });
    expect(onColUpdated).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.anything(), 'cols', true);

    onChange.mockClear();
    onColUpdated.mockClear();
    delete (model.props.cols.a as Record<string, unknown>).color;
    expect(yBlock.get('prop:cols.a.color')).toBe(undefined);
    expect(model.props.cols.a).toEqual({});
    expect(model.props.cols$.value).toEqual({ a: {} });
    expect(onColUpdated).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.anything(), 'cols', true);

    model.props.cols = {
      a: { color: 'red' },
      b: { color: 'blue' },
    };
    onChange.mockClear();
    onColUpdated.mockClear();
    delete (model.props as Record<string, unknown>).cols;
    expect(model.props.cols$.value).toBeUndefined();
    expect(yBlock.get('prop:cols.a.color')).toBe(undefined);
    expect(yBlock.get('prop:cols.b.color')).toBe(undefined);
    expect(onColUpdated).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    onChange.mockClear();
    model.props.title.insert('test', 0);
    expect((yBlock.get('prop:title') as Y.Text).toJSON()).toBe('test');
    expect(model.props.title$.value.toDelta()).toEqual([{ insert: 'test' }]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.anything(), 'title', true);

    onChange.mockClear();
    model.props.labels.push('test');
    const getLabels = () => yBlock.get('prop:labels') as Y.Array<unknown>;
    expect(getLabels().toJSON()).toEqual(['test']);
    expect(model.props.labels$.value).toEqual(['test']);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.anything(), 'labels', true);

    onChange.mockClear();
    model.props.labels$.value = ['test2'];
    expect(getLabels().toJSON()).toEqual(['test2']);
    expect(onChange).toHaveBeenCalledWith(expect.anything(), 'labels', true);

    onChange.mockClear();
    model.props.labels.splice(0, 1);
    expect(getLabels().toJSON()).toEqual([]);
    expect(model.props.labels$.value).toEqual([]);
    expect(onChange).toHaveBeenCalledWith(expect.anything(), 'labels', true);

    model.props.textCols = {
      a: internalPrimitives.Text(),
    };
    onChange.mockClear();
    model.props.textCols.a.insert('test', 0);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.anything(), 'textCols', true);
    expect((yBlock.get('prop:textCols.a') as Y.Text).toJSON()).toBe('test');
    expect(model.props.textCols$.value.a.toDelta()).toEqual([
      { insert: 'test' },
    ]);

    onChange.mockClear();
    expect(model.props).not.toHaveProperty('optional');
    expect(model.props).toHaveProperty('optional$');
    model.props.optional$.value = 'test';
    expect(model.props.optional).toBe('test');
    expect(model.props.optional$.value).toBe('test');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.anything(), 'optional', true);
    expect(yBlock.get('prop:optional')).toBe('test');
  });

  test('stash and pop', () => {
    const doc = createTestDoc();
    const yDoc = new Y.Doc();
    const yBlock = yDoc.getMap('yBlock') as YBlock;
    yBlock.set('sys:id', '0');
    yBlock.set('sys:flavour', 'flat-table');
    yBlock.set('sys:children', new Y.Array());
    const onColUpdated = vi.fn();

    const onChange = vi.fn();
    const block = new Block(doc.schema, yBlock, doc, { onChange });
    const model = block.model as FlatTableModel;

    model.props.cols$.subscribe(onColUpdated);

    onChange.mockClear();
    onColUpdated.mockClear();

    model.props.cols = {
      a: { color: 'red' },
    };
    expect(yBlock.get('prop:cols.a.color')).toBe('red');
    expect(model.props.cols$.value.a.color).toBe('red');
    expect(onColUpdated).toHaveBeenCalledTimes(1);

    onChange.mockClear();
    onColUpdated.mockClear();

    model.stash('cols');
    model.props.cols.a.color = 'blue';
    expect(yBlock.get('prop:cols.a.color')).toBe('red');
    expect(model.props.cols$.value.a.color).toBe('blue');
    expect(onColUpdated).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);

    model.pop('cols');
    expect(yBlock.get('prop:cols.a.color')).toBe('blue');
    expect(onColUpdated).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
