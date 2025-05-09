import type { Subject } from 'rxjs';
import { assert, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyUpdate, type Doc, encodeStateAsUpdate } from 'yjs';

import type { BlockModel, DocMeta, Store } from '../index.js';
import { Text } from '../reactive/text/index.js';
import { createAutoIncrementIdGenerator } from '../test/index.js';
import { TestWorkspace } from '../test/test-workspace.js';
import {
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  RootBlockSchemaExtension,
} from './test-schema.js';

function createTestOptions() {
  const idGenerator = createAutoIncrementIdGenerator();
  return { id: 'test-collection', idGenerator };
}

const defaultDocId = 'doc:home';
const spaceId = defaultDocId;
const spaceMetaId = 'meta';

function serializCollection(doc: Doc): Record<string, any> {
  const spaces = {};
  doc.getMap('spaces').forEach((subDoc, key) => {
    // @ts-expect-error ignore
    spaces[key] = subDoc.toJSON();
  });
  const json = doc.toJSON();
  delete json.spaces;

  return {
    ...json,
    spaces,
  };
}

function waitOnce<T>(slot: Subject<T>) {
  return new Promise<T>(resolve => {
    const subscription = slot.subscribe(val => {
      subscription.unsubscribe();
      resolve(val);
    });
  });
}

function createRoot(doc: Store) {
  doc.addBlock('affine:page');
  if (!doc.root) throw new Error('root not found');
  return doc.root;
}

const extensions = [
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  RootBlockSchemaExtension,
];

function createTestDoc(docId = defaultDocId) {
  const options = createTestOptions();
  const collection = new TestWorkspace(options);
  collection.meta.initialize();
  const doc = collection.createDoc(docId);
  const store = doc.getStore({
    extensions,
  });
  doc.load();
  return store;
}

function requestIdleCallbackPolyfill(
  callback: IdleRequestCallback,
  options?: IdleRequestOptions
) {
  const timeout = options?.timeout ?? 1000;
  const start = Date.now();
  return setTimeout(function () {
    callback({
      didTimeout: false,
      timeRemaining: function () {
        return Math.max(0, timeout - (Date.now() - start));
      },
    });
  }, timeout) as unknown as number;
}

beforeEach(() => {
  if (globalThis.requestIdleCallback === undefined) {
    globalThis.requestIdleCallback = requestIdleCallbackPolyfill;
  }
});

describe('basic', () => {
  it('can init collection', () => {
    const options = createTestOptions();
    const collection = new TestWorkspace(options);
    collection.meta.initialize();

    const doc = collection.createDoc('doc:home');
    doc.load();
    const actual = serializCollection(collection.doc);
    const actualDoc = actual[spaceMetaId].pages[0] as DocMeta;

    assert.equal(typeof actualDoc.createDate, 'number');
    // @ts-expect-error ignore
    delete actualDoc.createDate;

    assert.deepEqual(actual, {
      [spaceMetaId]: {
        pages: [
          {
            id: 'doc:home',
            title: '',
            tags: [],
          },
        ],
      },
      spaces: {
        [spaceId]: {
          blocks: {},
        },
      },
    });
  });

  it('init collection with custom id generator', () => {
    const options = createTestOptions();
    let id = 100;
    const collection = new TestWorkspace({
      ...options,
      idGenerator: () => {
        return String(id++);
      },
    });
    collection.meta.initialize();
    {
      const doc = collection.createDoc();
      assert.equal(doc.id, '100');
    }
    {
      const doc = collection.createDoc();
      assert.equal(doc.id, '101');
    }
  });

  it('doc ready lifecycle', () => {
    const options = createTestOptions();
    const collection = new TestWorkspace(options);
    collection.meta.initialize();
    const doc = collection.createDoc('space:0');
    const store = doc.getStore({
      extensions,
    });

    const readyCallback = vi.fn();
    const rootAddedCallback = vi.fn();
    store.slots.ready.subscribe(readyCallback);
    store.slots.rootAdded.subscribe(rootAddedCallback);

    store.load(() => {
      const rootId = store.addBlock('affine:page', {
        title: new Text(),
      });
      expect(rootAddedCallback).toBeCalledTimes(1);

      store.addBlock('affine:note', {}, rootId);
    });

    expect(readyCallback).toBeCalledTimes(1);
  });

  it('collection docs with yjs applyUpdate', () => {
    const options = createTestOptions();
    const collection = new TestWorkspace(options);
    collection.meta.initialize();
    const collection2 = new TestWorkspace(options);
    const doc = collection.createDoc('space:0');
    const store = doc.getStore({
      extensions,
    });
    doc.load(() => {
      store.addBlock('affine:page', {
        title: new Text(),
      });
    });
    {
      const subdocsTester = vi.fn(({ added }) => {
        expect(added.size).toBe(1);
      });
      // only apply root update
      collection2.doc.once('subdocs', subdocsTester);
      expect(subdocsTester).toBeCalledTimes(0);
      expect(collection2.docs.size).toBe(0);
      const update = encodeStateAsUpdate(collection.doc);
      applyUpdate(collection2.doc, update);
      expect(serializCollection(collection2.doc)['spaces']).toEqual({
        'space:0': {
          blocks: {},
        },
      });
      expect(collection2.docs.size).toBe(1);
      expect(subdocsTester).toBeCalledTimes(1);
    }
    {
      // apply doc update
      const update = encodeStateAsUpdate(doc.spaceDoc);
      expect(collection2.docs.size).toBe(1);
      const doc2 = collection2.getDoc('space:0');
      if (!doc2) {
        throw new Error('doc2 is not found');
      }
      applyUpdate(doc2.spaceDoc, update);
      expect(serializCollection(collection2.doc)['spaces']).toEqual({
        'space:0': {
          blocks: {
            '0': {
              'prop:count': 0,
              'prop:items': [],
              'prop:style': {},
              'prop:title': '',
              'sys:children': [],
              'sys:flavour': 'affine:page',
              'sys:id': '0',
              'sys:version': 2,
            },
          },
        },
      });
      const fn = vi.fn(({ loaded }) => {
        expect(loaded.size).toBe(1);
      });
      collection2.doc.once('subdocs', fn);
      expect(fn).toBeCalledTimes(0);
      doc2.load();
      expect(fn).toBeCalledTimes(1);
    }
  });
});

describe('addBlock', () => {
  it('can add single model', () => {
    const doc = createTestDoc();
    doc.addBlock('affine:page', {
      title: new Text(),
    });

    assert.deepEqual(serializCollection(doc.rootDoc).spaces[spaceId].blocks, {
      '0': {
        'prop:count': 0,
        'prop:items': [],
        'prop:style': {},
        'prop:title': '',
        'sys:children': [],
        'sys:flavour': 'affine:page',
        'sys:id': '0',
        'sys:version': 2,
      },
    });
  });

  it('can add model with props', () => {
    const doc = createTestDoc();
    doc.addBlock('affine:page', { title: new Text('hello') });

    assert.deepEqual(serializCollection(doc.rootDoc).spaces[spaceId].blocks, {
      '0': {
        'prop:count': 0,
        'prop:items': [],
        'prop:style': {},
        'sys:children': [],
        'sys:flavour': 'affine:page',
        'sys:id': '0',
        'prop:title': 'hello',
        'sys:version': 2,
      },
    });
  });

  it('can add multi models', () => {
    const doc = createTestDoc();
    const rootId = doc.addBlock('affine:page', {
      title: new Text(),
    });
    const noteId = doc.addBlock('affine:note', {}, rootId);
    doc.addBlock('affine:paragraph', {}, noteId);
    doc.addBlocks(
      [
        { flavour: 'affine:paragraph', blockProps: { type: 'h1' } },
        { flavour: 'affine:paragraph', blockProps: { type: 'h2' } },
      ],
      noteId
    );

    assert.deepEqual(serializCollection(doc.rootDoc).spaces[spaceId].blocks, {
      '0': {
        'prop:count': 0,
        'prop:items': [],
        'prop:style': {},
        'sys:children': ['1'],
        'sys:flavour': 'affine:page',
        'sys:id': '0',
        'prop:title': '',
        'sys:version': 2,
      },
      '1': {
        'sys:children': ['2', '3', '4'],
        'sys:flavour': 'affine:note',
        'sys:id': '1',
        'sys:version': 1,
      },
      '2': {
        'sys:children': [],
        'sys:flavour': 'affine:paragraph',
        'sys:id': '2',
        'prop:text': '',
        'prop:type': 'text',
        'sys:version': 1,
      },
      '3': {
        'sys:children': [],
        'sys:flavour': 'affine:paragraph',
        'sys:id': '3',
        'prop:text': '',
        'prop:type': 'h1',
        'sys:version': 1,
      },
      '4': {
        'sys:children': [],
        'sys:flavour': 'affine:paragraph',
        'sys:id': '4',
        'prop:text': '',
        'prop:type': 'h2',
        'sys:version': 1,
      },
    });
  });

  it('can observe slot events', async () => {
    const doc = createTestDoc();

    queueMicrotask(() =>
      doc.addBlock('affine:page', {
        title: new Text(),
      })
    );
    const blockId = await waitOnce(doc.slots.rootAdded);
    const block = doc.getModelById(blockId) as BlockModel;
    assert.equal(block.flavour, 'affine:page');
  });

  it('can add block to root', async () => {
    const doc = createTestDoc();

    let noteId: string;

    queueMicrotask(() => {
      const rootId = doc.addBlock('affine:page');
      noteId = doc.addBlock('affine:note', {}, rootId);
    });
    await waitOnce(doc.slots.rootAdded);
    const { root } = doc;
    if (!root) throw new Error('root is null');

    assert.equal(root.flavour, 'affine:page');

    doc.addBlock('affine:paragraph', {}, noteId!);
    assert.equal(root.children[0].flavour, 'affine:note');
    assert.equal(root.children[0].children[0].flavour, 'affine:paragraph');
    assert.equal(root.childMap.value.get('1'), 0);

    const serializedChildren = serializCollection(doc.rootDoc).spaces[spaceId]
      .blocks['0']['sys:children'];
    assert.deepEqual(serializedChildren, ['1']);
    assert.equal(root.children[0].id, '1');
  });

  it('can add and remove multi docs', async () => {
    const options = createTestOptions();
    const collection = new TestWorkspace(options);
    collection.meta.initialize();

    const doc0 = collection.createDoc('doc:home');
    const doc1 = collection.createDoc('space:doc1');
    await Promise.all([doc0.load(), doc1.load()]);
    assert.equal(collection.docs.size, 2);
    const store0 = doc0.getStore({
      extensions,
    });

    store0.addBlock('affine:page', {
      title: new Text(),
    });
    collection.removeDoc(doc0.id);

    assert.equal(collection.docs.size, 1);
    assert.equal(
      serializCollection(doc0.rootDoc).spaces['doc:home'],
      undefined
    );

    collection.removeDoc(doc1.id);
    assert.equal(collection.docs.size, 0);
  });

  it('can remove doc that has not been loaded', () => {
    const options = createTestOptions();
    const collection = new TestWorkspace(options);
    collection.meta.initialize();

    const doc0 = collection.createDoc('doc:home');
    collection.removeDoc(doc0.id);
    assert.equal(collection.docs.size, 0);
  });

  it('can set doc state', () => {
    const options = createTestOptions();
    const collection = new TestWorkspace(options);
    collection.meta.initialize();
    collection.createDoc('doc:home');

    assert.deepEqual(
      collection.meta.docMetas.map(({ id, title }) => ({
        id,
        title,
      })),
      [
        {
          id: 'doc:home',
          title: '',
        },
      ]
    );

    let called = false;
    collection.slots.docListUpdated.subscribe(() => {
      called = true;
    });

    collection.meta.setDocMeta('doc:home', { favorite: true });
    assert.deepEqual(
      collection.meta.docMetas.map(({ id, title, favorite }) => ({
        id,
        title,
        favorite,
      })),
      [
        {
          id: 'doc:home',
          title: '',
          favorite: true,
        },
      ]
    );
    assert.ok(called);
  });
});

describe('deleteBlock', () => {
  it('delete children recursively by default', () => {
    const doc = createTestDoc();

    const rootId = doc.addBlock('affine:page', {});
    const noteId = doc.addBlock('affine:note', {}, rootId);
    doc.addBlock('affine:paragraph', {}, noteId);
    doc.addBlock('affine:paragraph', {}, noteId);
    assert.deepEqual(serializCollection(doc.rootDoc).spaces[spaceId].blocks, {
      '0': {
        'prop:count': 0,
        'prop:items': [],
        'prop:style': {},
        'prop:title': '',
        'sys:children': ['1'],
        'sys:flavour': 'affine:page',
        'sys:id': '0',
        'sys:version': 2,
      },
      '1': {
        'sys:children': ['2', '3'],
        'sys:flavour': 'affine:note',
        'sys:id': '1',
        'sys:version': 1,
      },
      '2': {
        'prop:text': '',
        'prop:type': 'text',
        'sys:children': [],
        'sys:flavour': 'affine:paragraph',
        'sys:id': '2',
        'sys:version': 1,
      },
      '3': {
        'prop:text': '',
        'prop:type': 'text',
        'sys:children': [],
        'sys:flavour': 'affine:paragraph',
        'sys:id': '3',
        'sys:version': 1,
      },
    });

    const deletedModel = doc.getModelById('1') as BlockModel;
    doc.deleteBlock(deletedModel);

    assert.deepEqual(serializCollection(doc.rootDoc).spaces[spaceId].blocks, {
      '0': {
        'prop:count': 0,
        'prop:items': [],
        'prop:style': {},
        'prop:title': '',
        'sys:children': [],
        'sys:flavour': 'affine:page',
        'sys:id': '0',
        'sys:version': 2,
      },
    });
  });

  it('bring children to parent', () => {
    const doc = createTestDoc();

    const rootId = doc.addBlock('affine:page', {});
    const noteId = doc.addBlock('affine:note', {}, rootId);
    const p1 = doc.addBlock('affine:paragraph', {}, noteId);
    doc.addBlock('affine:paragraph', {}, p1);
    doc.addBlock('affine:paragraph', {}, p1);

    assert.deepEqual(serializCollection(doc.rootDoc).spaces[spaceId].blocks, {
      '0': {
        'prop:count': 0,
        'prop:items': [],
        'prop:style': {},
        'prop:title': '',
        'sys:children': ['1'],
        'sys:flavour': 'affine:page',
        'sys:id': '0',
        'sys:version': 2,
      },
      '1': {
        'sys:children': ['2'],
        'sys:flavour': 'affine:note',
        'sys:id': '1',
        'sys:version': 1,
      },
      '2': {
        'prop:text': '',
        'prop:type': 'text',
        'sys:children': ['3', '4'],
        'sys:flavour': 'affine:paragraph',
        'sys:id': '2',
        'sys:version': 1,
      },
      '3': {
        'prop:text': '',
        'prop:type': 'text',
        'sys:children': [],
        'sys:flavour': 'affine:paragraph',
        'sys:id': '3',
        'sys:version': 1,
      },
      '4': {
        'prop:text': '',
        'prop:type': 'text',
        'sys:children': [],
        'sys:flavour': 'affine:paragraph',
        'sys:id': '4',
        'sys:version': 1,
      },
    });

    const deletedModel = doc.getModelById('2') as BlockModel;
    const deletedModelParent = doc.getModelById('1') as BlockModel;
    doc.deleteBlock(deletedModel, {
      bringChildrenTo: deletedModelParent,
    });

    assert.deepEqual(serializCollection(doc.rootDoc).spaces[spaceId].blocks, {
      '0': {
        'prop:count': 0,
        'prop:items': [],
        'prop:style': {},
        'prop:title': '',
        'sys:children': ['1'],
        'sys:flavour': 'affine:page',
        'sys:id': '0',
        'sys:version': 2,
      },
      '1': {
        'sys:children': ['3', '4'],
        'sys:flavour': 'affine:note',
        'sys:id': '1',
        'sys:version': 1,
      },
      '3': {
        'prop:text': '',
        'prop:type': 'text',
        'sys:children': [],
        'sys:flavour': 'affine:paragraph',
        'sys:id': '3',
        'sys:version': 1,
      },
      '4': {
        'prop:text': '',
        'prop:type': 'text',
        'sys:children': [],
        'sys:flavour': 'affine:paragraph',
        'sys:id': '4',
        'sys:version': 1,
      },
    });
  });

  it('bring children to other block', () => {
    const doc = createTestDoc();

    const rootId = doc.addBlock('affine:page', {});
    const noteId = doc.addBlock('affine:note', {}, rootId);
    const p1 = doc.addBlock('affine:paragraph', {}, noteId);
    const p2 = doc.addBlock('affine:paragraph', {}, noteId);
    doc.addBlock('affine:paragraph', {}, p1);
    doc.addBlock('affine:paragraph', {}, p1);
    doc.addBlock('affine:paragraph', {}, p2);

    assert.deepEqual(serializCollection(doc.rootDoc).spaces[spaceId].blocks, {
      '0': {
        'prop:count': 0,
        'prop:items': [],
        'prop:style': {},
        'prop:title': '',
        'sys:children': ['1'],
        'sys:flavour': 'affine:page',
        'sys:id': '0',
        'sys:version': 2,
      },
      '1': {
        'sys:children': ['2', '3'],
        'sys:flavour': 'affine:note',
        'sys:id': '1',
        'sys:version': 1,
      },
      '2': {
        'prop:text': '',
        'prop:type': 'text',
        'sys:children': ['4', '5'],
        'sys:flavour': 'affine:paragraph',
        'sys:id': '2',
        'sys:version': 1,
      },
      '3': {
        'prop:text': '',
        'prop:type': 'text',
        'sys:children': ['6'],
        'sys:flavour': 'affine:paragraph',
        'sys:id': '3',
        'sys:version': 1,
      },
      '4': {
        'prop:text': '',
        'prop:type': 'text',
        'sys:children': [],
        'sys:flavour': 'affine:paragraph',
        'sys:id': '4',
        'sys:version': 1,
      },
      '5': {
        'prop:text': '',
        'prop:type': 'text',
        'sys:children': [],
        'sys:flavour': 'affine:paragraph',
        'sys:id': '5',
        'sys:version': 1,
      },
      '6': {
        'prop:text': '',
        'prop:type': 'text',
        'sys:children': [],
        'sys:flavour': 'affine:paragraph',
        'sys:id': '6',
        'sys:version': 1,
      },
    });

    const deletedModel = doc.getModelById('2') as BlockModel;
    const moveToModel = doc.getModelById('3') as BlockModel;
    doc.deleteBlock(deletedModel, {
      bringChildrenTo: moveToModel,
    });

    assert.deepEqual(serializCollection(doc.rootDoc).spaces[spaceId].blocks, {
      '0': {
        'prop:count': 0,
        'prop:items': [],
        'prop:style': {},
        'prop:title': '',
        'sys:children': ['1'],
        'sys:flavour': 'affine:page',
        'sys:id': '0',
        'sys:version': 2,
      },
      '1': {
        'sys:children': ['3'],
        'sys:flavour': 'affine:note',
        'sys:id': '1',
        'sys:version': 1,
      },
      '3': {
        'prop:text': '',
        'prop:type': 'text',
        'sys:children': ['6', '4', '5'],
        'sys:flavour': 'affine:paragraph',
        'sys:id': '3',
        'sys:version': 1,
      },
      '4': {
        'prop:text': '',
        'prop:type': 'text',
        'sys:children': [],
        'sys:flavour': 'affine:paragraph',
        'sys:id': '4',
        'sys:version': 1,
      },
      '5': {
        'prop:text': '',
        'prop:type': 'text',
        'sys:children': [],
        'sys:flavour': 'affine:paragraph',
        'sys:id': '5',
        'sys:version': 1,
      },
      '6': {
        'prop:text': '',
        'prop:type': 'text',
        'sys:children': [],
        'sys:flavour': 'affine:paragraph',
        'sys:id': '6',
        'sys:version': 1,
      },
    });
  });

  it('can delete model with parent', () => {
    const doc = createTestDoc();
    const rootModel = createRoot(doc);
    const noteId = doc.addBlock('affine:note', {}, rootModel.id);

    doc.addBlock('affine:paragraph', {}, noteId);

    // before delete
    assert.deepEqual(serializCollection(doc.rootDoc).spaces[spaceId].blocks, {
      '0': {
        'prop:count': 0,
        'prop:items': [],
        'prop:style': {},
        'prop:title': '',
        'sys:children': ['1'],
        'sys:flavour': 'affine:page',
        'sys:id': '0',
        'sys:version': 2,
      },
      '1': {
        'sys:children': ['2'],
        'sys:flavour': 'affine:note',
        'sys:id': '1',
        'sys:version': 1,
      },
      '2': {
        'sys:children': [],
        'sys:flavour': 'affine:paragraph',
        'sys:id': '2',
        'prop:text': '',
        'prop:type': 'text',
        'sys:version': 1,
      },
    });

    doc.deleteBlock(rootModel.children[0].children[0]);

    // after delete
    assert.deepEqual(serializCollection(doc.rootDoc).spaces[spaceId].blocks, {
      '0': {
        'prop:count': 0,
        'prop:items': [],
        'prop:style': {},
        'prop:title': '',
        'sys:children': ['1'],
        'sys:flavour': 'affine:page',
        'sys:id': '0',
        'sys:version': 2,
      },
      '1': {
        'sys:children': [],
        'sys:flavour': 'affine:note',
        'sys:id': '1',
        'sys:version': 1,
      },
    });
    assert.equal(rootModel.children.length, 1);
  });
});

describe('getBlock', () => {
  it('can get block by id', () => {
    const doc = createTestDoc();
    const rootModel = createRoot(doc);
    const noteId = doc.addBlock('affine:note', {}, rootModel.id);

    doc.addBlock('affine:paragraph', {}, noteId);
    doc.addBlock('affine:paragraph', {}, noteId);

    const text = doc.getModelById('3') as BlockModel;
    assert.equal(text.flavour, 'affine:paragraph');
    assert.equal(rootModel.children[0].children.indexOf(text), 1);

    const invalid = doc.getModelById('😅');
    assert.equal(invalid, null);
  });

  it('can get parent', () => {
    const doc = createTestDoc();
    const rootModel = createRoot(doc);
    const noteId = doc.addBlock('affine:note', {}, rootModel.id);

    doc.addBlock('affine:paragraph', {}, noteId);
    doc.addBlock('affine:paragraph', {}, noteId);

    const result = doc.getParent(
      rootModel.children[0].children[1]
    ) as BlockModel;
    assert.equal(result, rootModel.children[0]);

    const invalid = doc.getParent(rootModel);
    assert.equal(invalid, null);
  });

  it('can get previous sibling', () => {
    const doc = createTestDoc();
    const rootModel = createRoot(doc);
    const noteId = doc.addBlock('affine:note', {}, rootModel.id);

    doc.addBlock('affine:paragraph', {}, noteId);
    doc.addBlock('affine:paragraph', {}, noteId);

    const result = doc.getPrev(rootModel.children[0].children[1]) as BlockModel;
    assert.equal(result, rootModel.children[0].children[0]);

    const invalid = doc.getPrev(rootModel.children[0].children[0]);
    assert.equal(invalid, null);
  });
});
