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

test('should index affine:frame blocks with their title', async () => {
  const doc = new YDoc({
    guid: 'frame-doc',
  });
  const blocks = doc.getMap('blocks');

  const pageTitle = new YText();
  pageTitle.insert(0, 'Page');
  const page = new YMap();
  page.set('sys:id', 'page');
  page.set('sys:flavour', 'affine:page');
  page.set('sys:children', YArray.from(['surface']));
  page.set('prop:title', pageTitle);
  blocks.set('page', page);

  const surface = new YMap();
  surface.set('sys:id', 'surface');
  surface.set('sys:flavour', 'affine:surface');
  surface.set('sys:children', YArray.from(['frame']));
  blocks.set('surface', surface);

  const frameTitle = new YText();
  frameTitle.insert(0, 'My Frame');
  const frame = new YMap();
  frame.set('sys:id', 'frame');
  frame.set('sys:flavour', 'affine:frame');
  frame.set('sys:children', new YArray());
  frame.set('prop:title', frameTitle);
  blocks.set('frame', frame);

  const result = await readAllBlocksFromDoc({
    ydoc: doc,
    spaceId: 'test-space',
  });

  const frameBlock = result?.blocks.find(block => block.blockId === 'frame');
  expect(frameBlock?.flavour).toEqual('affine:frame');
  expect(frameBlock?.content).toEqual('My Frame');
  expect(frameBlock?.additional?.frameTitle).toEqual('My Frame');
});

test('does not throw and crawls the rest of the doc when the affine:page block has no prop:title at all', async () => {
  // Regression test: a doc whose root `affine:page` block lacks a
  // `prop:title` Y.Text entirely (older imports/migrations, or otherwise
  // malformed data) used to make `block.get('prop:title').toString()`
  // throw uncaught, aborting the crawl for the *entire* doc — caught one
  // layer up in the indexer sync loop's own try/catch, which nonetheless
  // still marked that doc "indexed" at the current version despite having
  // indexed nothing, permanently hiding every block in it from search with
  // no retry. Confirmed live via a real user's workspace, not just
  // theorized: `indexedClock` showed the doc marked done at the current
  // index version while `indexerRecords` had zero rows for it.
  const doc = new YDoc({
    guid: 'no-title-doc',
  });
  const blocks = doc.getMap('blocks');

  const page = new YMap();
  page.set('sys:id', 'page');
  page.set('sys:flavour', 'affine:page');
  page.set('sys:children', YArray.from(['note']));
  // Deliberately no `page.set('prop:title', ...)` at all.
  blocks.set('page', page);

  const note = new YMap();
  note.set('sys:id', 'note');
  note.set('sys:flavour', 'affine:note');
  note.set('sys:children', YArray.from(['paragraph']));
  note.set('prop:displayMode', 'both');
  blocks.set('note', note);

  const paragraphText = new YText();
  paragraphText.insert(0, 'Still findable');
  const paragraph = new YMap();
  paragraph.set('sys:id', 'paragraph');
  paragraph.set('sys:flavour', 'affine:paragraph');
  paragraph.set('sys:children', new YArray());
  paragraph.set('prop:text', paragraphText);
  blocks.set('paragraph', paragraph);

  const result = await readAllBlocksFromDoc({
    ydoc: doc,
    spaceId: 'test-space',
  });

  expect(result).toBeTruthy();

  const pageBlock = result?.blocks.find(block => block.blockId === 'page');
  expect(pageBlock?.content).toEqual('');

  const paragraphBlock = result?.blocks.find(
    block => block.blockId === 'paragraph'
  );
  expect(paragraphBlock?.content).toEqual('Still findable');

  const noteBlock = result?.blocks.find(block => block.blockId === 'note');
  expect(noteBlock?.content).toEqual('');
});

test('should index a secondary affine:note block with its name, and the primary page note using the doc title', async () => {
  // Mirrors the `affine:frame` test above exactly for the secondary note.
  // The primary/page note (the doc's own main content, first among the
  // root's children with a non-`edgeless` displayMode) is now indexed too
  // (root-note referencing) — since it has no independent "name" set here,
  // it falls back to the doc's own title, not a child-text snippet (its
  // identity IS the page).
  const doc = new YDoc({
    guid: 'note-doc',
  });
  const blocks = doc.getMap('blocks');

  const pageTitle = new YText();
  pageTitle.insert(0, 'Page');
  const page = new YMap();
  page.set('sys:id', 'page');
  page.set('sys:flavour', 'affine:page');
  page.set('sys:children', YArray.from(['primary-note', 'secondary-note']));
  page.set('prop:title', pageTitle);
  blocks.set('page', page);

  const primaryNote = new YMap();
  primaryNote.set('sys:id', 'primary-note');
  primaryNote.set('sys:flavour', 'affine:note');
  primaryNote.set('sys:children', new YArray());
  primaryNote.set('prop:displayMode', 'both');
  blocks.set('primary-note', primaryNote);

  const secondaryNote = new YMap();
  secondaryNote.set('sys:id', 'secondary-note');
  secondaryNote.set('sys:flavour', 'affine:note');
  secondaryNote.set('sys:children', new YArray());
  secondaryNote.set('prop:displayMode', 'edgeless');
  secondaryNote.set('prop:name', 'Weekly checklist');
  blocks.set('secondary-note', secondaryNote);

  const result = await readAllBlocksFromDoc({
    ydoc: doc,
    spaceId: 'test-space',
  });

  const primaryNoteBlock = result?.blocks.find(
    block => block.blockId === 'primary-note'
  );
  expect(primaryNoteBlock?.flavour).toEqual('affine:note');
  expect(primaryNoteBlock?.content).toEqual('Page');
  expect(primaryNoteBlock?.additional?.noteTitle).toEqual('Page');

  const secondaryNoteBlock = result?.blocks.find(
    block => block.blockId === 'secondary-note'
  );
  expect(secondaryNoteBlock?.flavour).toEqual('affine:note');
  expect(secondaryNoteBlock?.content).toEqual('Weekly checklist');
  expect(secondaryNoteBlock?.additional?.noteTitle).toEqual('Weekly checklist');
});
