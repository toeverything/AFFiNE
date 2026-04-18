import { insertColumnsBlockCommand } from '@blocksuite/affine-block-note';
import {
  CalloutBlockSchemaExtension,
  CodeBlockSchemaExtension,
  ColumnBlockSchemaExtension,
  ColumnsBlockSchemaExtension,
  ListBlockSchemaExtension,
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  RootBlockSchemaExtension,
  TableBlockSchemaExtension,
} from '@blocksuite/affine-model';
import { getNextContentBlock } from '@blocksuite/affine-shared/utils';
import { Text } from '@blocksuite/store';
import {
  createAutoIncrementIdGenerator,
  TestWorkspace,
} from '@blocksuite/store/test';
import { describe, expect, test } from 'vitest';

import { effects } from '../../../../blocks/note/src/effects';

function createDoc() {
  const collection = new TestWorkspace({
    id: 'test-workspace',
    idGenerator: createAutoIncrementIdGenerator(),
  });
  collection.meta.initialize();
  const doc = collection.createDoc('doc0');
  doc.load();
  return doc.getStore({
    extensions: [
      RootBlockSchemaExtension,
      NoteBlockSchemaExtension,
      ParagraphBlockSchemaExtension,
      ListBlockSchemaExtension,
      CalloutBlockSchemaExtension,
      CodeBlockSchemaExtension,
      TableBlockSchemaExtension,
      ColumnsBlockSchemaExtension,
      ColumnBlockSchemaExtension,
    ],
  });
}

describe('columns block', () => {
  test('registers column custom elements', () => {
    effects();

    expect(customElements.get('affine-columns')).toBeTruthy();
    expect(customElements.get('affine-column')).toBeTruthy();
  });

  test('allows note -> columns -> column -> paragraph structure', () => {
    const doc = createDoc();
    const pageId = doc.addBlock('affine:page', { title: new Text('test') });
    const noteId = doc.addBlock('affine:note', {}, pageId);
    const columnsId = doc.addBlock('affine:columns', {}, noteId);
    const leftId = doc.addBlock('affine:column', { width: 1 }, columnsId);
    const rightId = doc.addBlock('affine:column', { width: 1 }, columnsId);
    const leftParagraphId = doc.addBlock(
      'affine:paragraph',
      { text: new Text('left') },
      leftId
    );
    const rightParagraphId = doc.addBlock(
      'affine:paragraph',
      { text: new Text('right') },
      rightId
    );

    const columns = doc.getModelById(columnsId);
    const leftParagraph = doc.getModelById(leftParagraphId);
    const rightParagraph = doc.getModelById(rightParagraphId);

    expect(columns?.children.map(child => child.flavour)).toEqual([
      'affine:column',
      'affine:column',
    ]);
    expect(leftParagraph?.parent?.id).toBe(leftId);
    expect(rightParagraph?.parent?.id).toBe(rightId);
  });

  test('navigates to the next column content in document order', () => {
    const doc = createDoc();
    const pageId = doc.addBlock('affine:page', { title: new Text('test') });
    const noteId = doc.addBlock('affine:note', {}, pageId);
    const columnsId = doc.addBlock('affine:columns', {}, noteId);
    const leftId = doc.addBlock('affine:column', { width: 1 }, columnsId);
    const rightId = doc.addBlock('affine:column', { width: 1 }, columnsId);
    const leftParagraphId = doc.addBlock(
      'affine:paragraph',
      { text: new Text('left') },
      leftId
    );
    const rightParagraphId = doc.addBlock(
      'affine:paragraph',
      { text: new Text('right') },
      rightId
    );

    const leftParagraph = doc.getModelById(leftParagraphId);
    const editorHost = {
      std: {
        get: () => ({
          getEditorMode: () => 'page',
        }),
      },
    } as never;

    expect(getNextContentBlock(editorHost, leftParagraph!)?.id).toBe(
      rightParagraphId
    );
  });

  test('allows common note blocks inside a column', () => {
    const doc = createDoc();

    expect(doc.schema.safeValidate('affine:paragraph', 'affine:column')).toBe(
      true
    );
    expect(doc.schema.safeValidate('affine:list', 'affine:column')).toBe(true);
    expect(doc.schema.safeValidate('affine:callout', 'affine:column')).toBe(
      true
    );
    expect(doc.schema.safeValidate('affine:code', 'affine:column')).toBe(true);
    expect(doc.schema.safeValidate('affine:table', 'affine:column')).toBe(true);
  });

  test('insertColumnsBlockCommand adds sibling columns with seeded paragraphs', () => {
    const doc = createDoc();
    const pageId = doc.addBlock('affine:page', { title: new Text('test') });
    const noteId = doc.addBlock('affine:note', {}, pageId);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const paragraph = doc.getModelById(paragraphId);
    let insertedColumnsBlockId: string | undefined;

    insertColumnsBlockCommand(
      {
        std: {
          store: doc,
        } as never,
        selectedModels: paragraph ? [paragraph] : [],
        columnCount: 2,
        place: 'after',
        removeEmptyLine: true,
      },
      next => {
        insertedColumnsBlockId = next?.insertedColumnsBlockId;
      }
    );

    const note = doc.getModelById(noteId);
    const columns = insertedColumnsBlockId
      ? doc.getModelById(insertedColumnsBlockId)
      : null;

    expect(note?.children.map(child => child.flavour)).toEqual([
      'affine:columns',
    ]);
    expect(columns?.children).toHaveLength(2);
    expect(
      columns?.children.every(column => column.flavour === 'affine:column')
    ).toBe(true);
    expect(
      columns?.children.every(column => column.children.length === 1)
    ).toBe(true);
    expect(
      columns?.children.every(
        column => column.children[0]?.flavour === 'affine:paragraph'
      )
    ).toBe(true);
  });
});
