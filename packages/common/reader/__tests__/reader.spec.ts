import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from 'vitest';
import {
  applyUpdate,
  Array as YArray,
  Doc as YDoc,
  Map as YMap,
  Text as YText,
} from 'yjs';

import {
  parsePageDoc,
  readAllBlocksFromDoc,
  readAllDocIdsFromRootDoc,
  readAllDocsFromRootDoc,
} from '../src';

const rootDocSnapshot = readFileSync(
  path.join(import.meta.dirname, './__fixtures__/test-root-doc.snapshot.bin')
);
const docSnapshot = readFileSync(
  path.join(import.meta.dirname, './__fixtures__/test-doc.snapshot.bin')
);
const docSnapshotWithAiEditable = readFileSync(
  path.join(
    import.meta.dirname,
    './__fixtures__/test-doc-with-ai-editable.snapshot.bin'
  )
);

test('should read doc blocks work', async () => {
  const rootDoc = new YDoc({
    guid: 'test-root-doc',
  });
  applyUpdate(rootDoc, rootDocSnapshot);

  const doc1 = new YDoc({
    guid: 'test-doc',
  });
  applyUpdate(doc1, docSnapshot);
  const result = await readAllBlocksFromDoc({
    ydoc: doc1,
    rootYDoc: rootDoc,
    spaceId: 'test-space',
  });
  expect(result).toMatchSnapshot();
});

test('should read doc blocks work without root doc', async () => {
  const doc = new YDoc({
    guid: 'test-doc',
  });
  applyUpdate(doc, docSnapshot);
  const result = await readAllBlocksFromDoc({
    ydoc: doc,
    spaceId: 'test-space',
  });
  expect(result).toMatchSnapshot();
});

test('should get all docs from root doc work', async () => {
  const rootDoc = new YDoc({
    guid: 'test-root-doc',
  });
  rootDoc.getMap('meta').set(
    'pages',
    YArray.from([
      new YMap([
        ['id', 'test-doc-1'],
        ['title', 'Test Doc 1'],
      ]),
      new YMap([
        ['id', 'test-doc-2'],
        ['title', 'Test Doc 2'],
      ]),
      new YMap([
        ['id', 'test-doc-3'],
        ['title', 'Test Doc 3'],
        ['trash', true],
      ]),
      new YMap([['id', 'test-doc-4']]),
    ])
  );

  const docs = readAllDocsFromRootDoc(rootDoc);
  expect(Array.from(docs.entries())).toMatchSnapshot();

  // include trash
  const docsWithTrash = readAllDocsFromRootDoc(rootDoc, {
    includeTrash: true,
  });
  expect(Array.from(docsWithTrash.entries())).toMatchSnapshot();
});

test('should read all docs from root doc snapshot work', async () => {
  const rootDoc = new YDoc({
    guid: 'test-root-doc',
  });
  applyUpdate(rootDoc, rootDocSnapshot);
  const docsWithTrash = readAllDocsFromRootDoc(rootDoc, {
    includeTrash: true,
  });
  expect(Array.from(docsWithTrash.entries())).toMatchSnapshot();
});

test('should read all doc ids from root doc snapshot work', async () => {
  const rootDoc = new YDoc({
    guid: 'test-root-doc',
  });
  applyUpdate(rootDoc, rootDocSnapshot);
  const docIds = readAllDocIdsFromRootDoc(rootDoc);
  expect(docIds).toMatchSnapshot();
});

test('should parse page doc work', () => {
  const doc = new YDoc({
    guid: 'test-doc',
  });
  applyUpdate(doc, docSnapshot);

  const result = parsePageDoc({
    workspaceId: 'test-space',
    doc,
    buildBlobUrl: id => `blob://${id}`,
    buildDocUrl: id => `doc://${id}`,
    renderDocTitle: id => `Doc Title ${id}`,
  });

  expect(result).toMatchSnapshot();
});

test('should parse page doc work with ai editable', () => {
  const doc = new YDoc({
    guid: 'test-doc',
  });
  applyUpdate(doc, docSnapshot);

  const result = parsePageDoc({
    workspaceId: 'test-space',
    doc,
    buildBlobUrl: id => `blob://${id}`,
    buildDocUrl: id => `doc://${id}`,
    renderDocTitle: id => `Doc Title ${id}`,
    aiEditable: true,
  });

  expect(result.md).toMatchSnapshot();
});

test('should parse page full doc work with ai editable', () => {
  const doc = new YDoc({
    guid: 'test-doc',
  });
  applyUpdate(doc, docSnapshotWithAiEditable);

  const result = parsePageDoc({
    workspaceId: 'test-space',
    doc,
    buildBlobUrl: id => `blob://${id}`,
    buildDocUrl: id => `doc://${id}`,
    renderDocTitle: id => `Doc Title ${id}`,
    aiEditable: true,
  });

  expect(result.md).toMatchSnapshot();
});

test('should index references from database rich-text cells', async () => {
  const doc = new YDoc({
    guid: 'db-doc',
  });
  const blocks = doc.getMap('blocks');

  const pageTitle = new YText();
  pageTitle.insert(0, 'Page');
  const page = new YMap();
  page.set('sys:id', 'page');
  page.set('sys:flavour', 'affine:page');
  page.set('sys:children', YArray.from(['note']));
  page.set('prop:title', pageTitle);
  blocks.set('page', page);

  const note = new YMap();
  note.set('sys:id', 'note');
  note.set('sys:flavour', 'affine:note');
  note.set('sys:children', YArray.from(['db']));
  note.set('prop:displayMode', 'page');
  blocks.set('note', note);

  const dbTitle = new YText();
  dbTitle.insert(0, 'Database');
  const db = new YMap();
  db.set('sys:id', 'db');
  db.set('sys:flavour', 'affine:database');
  db.set('sys:children', new YArray());
  db.set('prop:title', dbTitle);

  const columns = new YArray();
  const column = new YMap();
  column.set('id', 'col1');
  column.set('name', 'Text');
  column.set('type', 'rich-text');
  column.set('data', new YMap());
  columns.push([column]);
  db.set('prop:columns', columns);

  const cellText = new YText();
  cellText.applyDelta([
    { insert: 'See ' },
    {
      insert: 'Target',
      attributes: {
        reference: {
          pageId: 'target-doc',
          params: { mode: 'page' },
        },
      },
    },
  ]);

  const cell = new YMap();
  cell.set('columnId', 'col1');
  cell.set('value', cellText);
  const row = new YMap();
  row.set('col1', cell);
  const cells = new YMap();
  cells.set('row1', row);
  db.set('prop:cells', cells);

  blocks.set('db', db);

  const result = await readAllBlocksFromDoc({
    ydoc: doc,
    spaceId: 'test-space',
  });

  const dbBlock = result?.blocks.find(block => block.blockId === 'db');
  expect(dbBlock?.refDocId).toEqual(['target-doc']);
  expect(dbBlock?.ref).toEqual([
    JSON.stringify({ docId: 'target-doc', mode: 'page' }),
  ]);
});
