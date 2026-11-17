import { describe, expect, it } from 'vitest';

import { Text } from '../reactive/text/index.js';
import { createAutoIncrementIdGenerator } from '../test/index.js';
import { TestWorkspace } from '../test/test-workspace.js';
import {
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  RootBlockSchemaExtension,
} from './test-schema.js';

const extensions = [
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  RootBlockSchemaExtension,
];

function createTestDoc() {
  const options = {
    id: 'test-collection',
    idGenerator: createAutoIncrementIdGenerator(),
  };
  const collection = new TestWorkspace(options);
  collection.meta.initialize();
  const doc = collection.createDoc('doc:home');
  const store = doc.getStore({ extensions });
  doc.load();
  return { collection, doc, store };
}

// The `ancestor` match kind exists specifically so a consumer that wants
// "this block and everything under it, forever" (a cross-doc reference
// rendering a whole note — see `note-ref-block.ts`'s own `_maybeRefreshPreview`)
// can express that once, at query-construction time, instead of having to
// enumerate every descendant id into a fixed snapshot and rebuild the
// entire Query/Store every time a new block is added anywhere inside that
// subtree. This is a regression test for a real architectural fix: without
// it, `note-ref-block.ts` had to fully replace its own nested `Store`/
// `BlockStdScope` on every structural edit (Enter, a markdown-shortcut
// conversion), destroying and recreating all of that reference's own DOM
// — the actual root cause behind a whole session's worth of chased
// symptoms (focus loss, a visible scroll jump, a slash-menu popup never
// appearing).
describe('Query ancestor match', () => {
  it('includes an existing descendant of the ancestor block, and excludes an unrelated sibling', () => {
    const { store } = createTestDoc();
    const rootId = store.addBlock('affine:page', { title: new Text() });
    const noteId = store.addBlock('affine:note', {}, rootId);
    const insideId = store.addBlock(
      'affine:paragraph',
      { text: new Text('inside the note') },
      noteId
    );
    // A second, unrelated note — its own paragraph must stay hidden.
    const otherNoteId = store.addBlock('affine:note', {}, rootId);
    const outsideId = store.addBlock(
      'affine:paragraph',
      { text: new Text('outside the note') },
      otherNoteId
    );

    const filteredStore = store.doc.getStore({
      extensions,
      query: {
        mode: 'include',
        match: [
          { id: noteId, viewType: 'display' },
          { ancestor: noteId, viewType: 'display' },
        ],
      },
    });

    expect(filteredStore.getBlock(insideId)?.blockViewType).toBe('display');
    expect(filteredStore.getBlock(outsideId)?.blockViewType).toBe('hidden');
  });

  it('classifies a block added AFTER the store was constructed as display, with no query/store rebuild required', () => {
    const { store } = createTestDoc();
    const rootId = store.addBlock('affine:page', { title: new Text() });
    const noteId = store.addBlock('affine:note', {}, rootId);
    store.addBlock(
      'affine:paragraph',
      { text: new Text('already there') },
      noteId
    );

    const filteredStore = store.doc.getStore({
      extensions,
      query: {
        mode: 'include',
        match: [
          { id: noteId, viewType: 'display' },
          { ancestor: noteId, viewType: 'display' },
        ],
      },
    });

    // The critical assertion: a block created on the *underlying*,
    // unfiltered store — well after `filteredStore` was already
    // constructed — must still classify as 'display' the moment it's
    // added, without ever constructing a second Store or a new Query.
    const newId = store.addBlock(
      'affine:paragraph',
      { text: new Text('added later, same store') },
      noteId
    );

    expect(filteredStore.getBlock(newId)?.blockViewType).toBe('display');
  });

  it('still hides a block added later outside the ancestor subtree', () => {
    const { store } = createTestDoc();
    const rootId = store.addBlock('affine:page', { title: new Text() });
    const noteId = store.addBlock('affine:note', {}, rootId);
    const otherNoteId = store.addBlock('affine:note', {}, rootId);

    const filteredStore = store.doc.getStore({
      extensions,
      query: {
        mode: 'include',
        match: [
          { id: noteId, viewType: 'display' },
          { ancestor: noteId, viewType: 'display' },
        ],
      },
    });

    const newOutsideId = store.addBlock(
      'affine:paragraph',
      { text: new Text('added later, different note') },
      otherNoteId
    );

    expect(filteredStore.getBlock(newOutsideId)?.blockViewType).toBe('hidden');
  });
});
