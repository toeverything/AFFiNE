import {
  createAutoIncrementIdGenerator,
  TestWorkspace,
} from '@blocksuite/store/test';
import { describe, expect, test } from 'vitest';

import { effects } from '../effects.js';
import { TestEditorContainer } from './test-editor.js';
import {
  type HeadingBlockModel,
  HeadingBlockSchemaExtension,
  NoteBlockSchemaExtension,
  RootBlockSchemaExtension,
  SurfaceBlockSchemaExtension,
} from './test-schema.js';
import { testSpecs } from './test-spec.js';

effects();

const extensions = [
  RootBlockSchemaExtension,
  NoteBlockSchemaExtension,
  HeadingBlockSchemaExtension,
  SurfaceBlockSchemaExtension,
];

function createTestOptions() {
  const idGenerator = createAutoIncrementIdGenerator();
  return { id: 'test-collection', idGenerator };
}

function wait(time: number) {
  return new Promise(resolve => setTimeout(resolve, time));
}

describe('editor host', () => {
  test('editor host should rerender model when view changes', async () => {
    const collection = new TestWorkspace(createTestOptions());

    collection.meta.initialize();
    const doc = collection.createDoc('home');
    const store = doc.getStore({ extensions });
    doc.load();
    const rootId = store.addBlock('test:page');
    const noteId = store.addBlock('test:note', {}, rootId);
    const headingId = store.addBlock('test:heading', { type: 'h1' }, noteId);
    const headingBlock = store.getBlock(headingId)!;

    const editorContainer = new TestEditorContainer();
    editorContainer.doc = store;
    editorContainer.specs = testSpecs;

    document.body.append(editorContainer);

    await wait(50);
    let headingElm = editorContainer.std.view.getBlock(headingId);

    expect(headingElm!.tagName).toBe('TEST-H1-BLOCK');

    (headingBlock.model as HeadingBlockModel).props.type = 'h2';
    await wait(50);
    headingElm = editorContainer.std.view.getBlock(headingId);

    expect(headingElm!.tagName).toBe('TEST-H2-BLOCK');
  });
});
