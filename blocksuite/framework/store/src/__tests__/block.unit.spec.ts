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
