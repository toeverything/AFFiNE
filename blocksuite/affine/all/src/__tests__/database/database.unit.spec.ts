import {
  addProperty,
  copyCellsByProperty,
  databaseBlockProperties,
  deleteColumn,
  getCell,
  getProperty,
  updateCell,
} from '@blocksuite/affine-block-database';
import {
  type CellDataType,
  type ColumnDataType,
  type DatabaseBlockModel,
  DatabaseBlockSchemaExtension,
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  RootBlockSchemaExtension,
} from '@blocksuite/affine-model';
import { propertyModelPresets } from '@blocksuite/data-view/property-pure-presets';
import type { BlockModel, Store } from '@blocksuite/store';
import { Text } from '@blocksuite/store';
import {
  createAutoIncrementIdGenerator,
  TestWorkspace,
} from '@blocksuite/store/test';
import { beforeEach, describe, expect, test } from 'vitest';

const extensions = [
  RootBlockSchemaExtension,
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  DatabaseBlockSchemaExtension,
];

function createTestOptions() {
  const idGenerator = createAutoIncrementIdGenerator();
  return { id: 'test-collection', idGenerator };
}

function createTestDoc(docId = 'doc0') {
  const options = createTestOptions();
  const collection = new TestWorkspace(options);
  collection.meta.initialize();
  const doc = collection.createDoc(docId);
  doc.load();
  return doc.getStore({ extensions });
}

describe('DatabaseManager', () => {
  let doc: Store;
  let db: DatabaseBlockModel;

  let rootId: BlockModel['id'];
  let noteBlockId: BlockModel['id'];
  let databaseBlockId: BlockModel['id'];
  let p1: BlockModel['id'];
  let p2: BlockModel['id'];
  let col1: ColumnDataType['id'];
  let col2: ColumnDataType['id'];
  let col3: ColumnDataType['id'];

  const selection = [
    { id: '1', value: 'Done', color: 'var(--affine-tag-white)' },
    { id: '2', value: 'TODO', color: 'var(--affine-tag-pink)' },
    { id: '3', value: 'WIP', color: 'var(--affine-tag-blue)' },
  ];

  beforeEach(() => {
    doc = createTestDoc();

    rootId = doc.addBlock('affine:page', {
      title: new Text('database test'),
    });
    noteBlockId = doc.addBlock('affine:note', {}, rootId);

    databaseBlockId = doc.addBlock(
      'affine:database',
      {
        columns: [],
        titleColumn: 'Title',
      },
      noteBlockId
    );

    const databaseModel = doc.getModelById(
      databaseBlockId
    ) as DatabaseBlockModel;
    db = databaseModel;

    col1 = addProperty(
      db,
      'end',
      databaseBlockProperties.numberColumnConfig.create('Number')
    );
    col2 = addProperty(
      db,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Single Select', {
        options: selection,
      })
    );
    col3 = addProperty(
      db,
      'end',
      databaseBlockProperties.richTextColumnConfig.create('Rich Text')
    );

    doc.updateBlock(databaseModel, {
      columns: [col1, col2, col3],
    });

    p1 = doc.addBlock(
      'affine:paragraph',
      {
        text: new Text('text1'),
      },
      databaseBlockId
    );
    p2 = doc.addBlock(
      'affine:paragraph',
      {
        text: new Text('text2'),
      },
      databaseBlockId
    );

    updateCell(db, p1, {
      columnId: col1,
      value: 0.1,
    });
    updateCell(db, p2, {
      columnId: col2,
      value: [selection[1]],
    });
  });

  test('getColumn', () => {
    const column = {
      ...databaseBlockProperties.numberColumnConfig.create('testColumnId'),
      id: 'testColumnId',
    };
    addProperty(db, 'end', column);

    const result = getProperty(db, column.id);
    expect(result).toEqual(column);
  });

  test('addColumn', () => {
    const column =
      databaseBlockProperties.numberColumnConfig.create('Test Column');
    const id = addProperty(db, 'end', column);
    const result = getProperty(db, id);

    expect(result).toMatchObject(column);
    expect(result).toHaveProperty('id');
  });

  test('deleteColumn', () => {
    const column = {
      ...databaseBlockProperties.numberColumnConfig.create('Test Column'),
      id: 'testColumnId',
    };
    addProperty(db, 'end', column);
    expect(getProperty(db, column.id)).toEqual(column);

    deleteColumn(db, column.id);
    expect(getProperty(db, column.id)).toBeUndefined();
  });

  test('getCell', () => {
    const modelId = doc.addBlock(
      'affine:paragraph',
      {
        text: new Text('paragraph'),
      },
      noteBlockId
    );
    const column = {
      ...databaseBlockProperties.numberColumnConfig.create('Test Column'),
      id: 'testColumnId',
    };
    const cell: CellDataType = {
      columnId: column.id,
      value: 42,
    };

    addProperty(db, 'end', column);
    updateCell(db, modelId, cell);

    const model = doc.getModelById(modelId);

    expect(model).not.toBeNull();

    const result = getCell(db, model!.id, column.id);
    expect(result).toEqual(cell);
  });

  test('updateCell', () => {
    const newRowId = doc.addBlock(
      'affine:paragraph',
      {
        text: new Text('text3'),
      },
      databaseBlockId
    );

    updateCell(db, newRowId, {
      columnId: col2,
      value: [selection[2]],
    });

    const cell = getCell(db, newRowId, col2);
    expect(cell).toEqual({
      columnId: col2,
      value: [selection[2]],
    });
  });

  test('copyCellsByColumn', () => {
    const newColId = addProperty(
      db,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Copied Select', {
        options: selection,
      })
    );

    copyCellsByProperty(db, col2, newColId);

    const cell = getCell(db, p2, newColId);
    expect(cell).toEqual({
      columnId: newColId,
      value: [selection[1]],
    });
  });
});
