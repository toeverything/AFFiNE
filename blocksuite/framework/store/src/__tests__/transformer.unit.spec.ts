import { expect, test } from 'vitest';
import * as Y from 'yjs';

import { MemoryBlobCRUD } from '../adapter/index.js';
import { BlockSchemaExtension } from '../extension/schema.js';
import { BlockModel } from '../model/block/block-model.js';
import { defineBlockSchema } from '../model/block/zod.js';
import { Text } from '../reactive/index.js';
import { createAutoIncrementIdGenerator } from '../test/index.js';
import { TestWorkspace } from '../test/test-workspace.js';
import { AssetsManager, BaseBlockTransformer } from '../transformer/index.js';

const docSchema = defineBlockSchema({
  flavour: 'page',
  props: internal => ({
    title: internal.Text('doc title'),
    count: 3,
    style: {
      color: 'red',
    },
    items: [
      {
        id: 0,
        content: internal.Text('item 1'),
      },
      {
        id: 1,
        content: internal.Text('item 2'),
      },
      {
        id: 2,
        content: internal.Text('item 3'),
      },
    ],
  }),
  metadata: {
    role: 'root',
    version: 1,
  },
});

const docSchemaExtension = BlockSchemaExtension(docSchema);
class RootBlockModel extends BlockModel<
  ReturnType<(typeof docSchema)['model']['props']>
> {}

const extensions = [docSchemaExtension];

function createTestOptions() {
  const idGenerator = createAutoIncrementIdGenerator();
  return { id: 'test-collection', idGenerator };
}

const transformer = new BaseBlockTransformer(new Map());
const blobCRUD = new MemoryBlobCRUD();
const assets = new AssetsManager({ blob: blobCRUD });

test('model to snapshot', () => {
  const options = createTestOptions();
  const collection = new TestWorkspace(options);
  collection.meta.initialize();
  const doc = collection.createDoc('home');
  const store = doc.getStore({ extensions });
  doc.load();
  store.addBlock('page');
  const rootModel = store.root as RootBlockModel;

  expect(rootModel).not.toBeNull();
  const snapshot = transformer.toSnapshot({
    model: rootModel,
    assets,
  });
  expect(snapshot).toMatchSnapshot();
});

test('snapshot to model', async () => {
  const options = createTestOptions();
  const collection = new TestWorkspace(options);
  collection.meta.initialize();
  const doc = collection.createDoc('home');
  const store = doc.getStore({ extensions });
  doc.load();
  store.addBlock('page');
  const rootModel = store.root as RootBlockModel;

  const tempDoc = new Y.Doc();
  const map = tempDoc.getMap('temp');

  expect(rootModel).not.toBeNull();
  const snapshot = transformer.toSnapshot({
    model: rootModel,
    assets,
  });

  const model = await transformer.fromSnapshot({
    json: snapshot,
    assets,
    children: [],
  });
  expect(model.flavour).toBe(rootModel.flavour);

  // @ts-expect-error ignore
  expect(model.props.title).toBeInstanceOf(Text);

  // @ts-expect-error ignore
  map.set('title', model.props.title.yText);
  // @ts-expect-error ignore
  expect(model.props.title.toString()).toBe('doc title');

  // @ts-expect-error ignore
  expect(model.props.style).toEqual({
    color: 'red',
  });

  // @ts-expect-error ignore
  expect(model.props.count).toBe(3);

  // @ts-expect-error ignore
  expect(model.props.items).toMatchObject([
    {
      id: 0,
    },
    {
      id: 1,
    },
    {
      id: 2,
    },
  ]);

  // @ts-expect-error ignore
  model.props.items.forEach((item, index) => {
    expect(item.content).toBeInstanceOf(Text);
    const key = `item:${index}:content`;
    map.set(key, item.content.yText);
    expect(item.content.toString()).toBe(`item ${index + 1}`);
  });
});
