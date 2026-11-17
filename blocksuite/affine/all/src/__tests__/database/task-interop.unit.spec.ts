import {
  type DatabaseBlockModel,
  DatabaseBlockSchemaExtension,
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  RootBlockSchemaExtension,
} from '@blocksuite/affine-model';
import {
  createDatabaseRowTaskInteropLink,
  createTodoTaskInteropLink,
} from '@blocksuite/affine-shared/utils';
import { type BlockModel, type Store } from '@blocksuite/store';
import {
  createAutoIncrementIdGenerator,
  TestWorkspace,
} from '@blocksuite/store/test';
import { describe, expect, test } from 'vitest';

import { DatabaseBlockDataSource } from '../../../../blocks/database/src/data-source.js';

const extensions = [
  RootBlockSchemaExtension,
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  DatabaseBlockSchemaExtension,
];

function createTestDoc(docId = 'doc0') {
  const idGenerator = createAutoIncrementIdGenerator();
  const collection = new TestWorkspace({
    id: 'task-interop-test-collection',
    idGenerator,
  });
  collection.meta.initialize();
  const doc = collection.createDoc(docId);
  doc.load();
  return doc.getStore({ extensions });
}

function createDbDataSource() {
  const doc: Store = createTestDoc('interop-doc');
  const rootId = doc.addBlock('affine:page', {});
  const noteBlockId = doc.addBlock('affine:note', {}, rootId);
  const databaseBlockId: BlockModel['id'] = doc.addBlock(
    'affine:database',
    {
      columns: [],
      titleColumn: 'Title',
    },
    noteBlockId
  );
  const rowA = doc.addBlock('affine:paragraph', {}, databaseBlockId);
  const rowB = doc.addBlock('affine:paragraph', {}, databaseBlockId);
  const databaseModel = doc.getModelById(databaseBlockId) as DatabaseBlockModel;
  const dataSource = new DatabaseBlockDataSource(databaseModel);
  return { dataSource, rowA, rowB };
}

describe('database task interop', () => {
  test('roundtrips persisted task interop link on row cell', () => {
    const { dataSource, rowA } = createDbDataSource();
    const link = createDatabaseRowTaskInteropLink({
      docId: 'interop-doc',
      blockId: 'todo-1',
      databaseId: 'db-1',
    });

    dataSource.setTaskInteropLink(rowA, link);

    expect(dataSource.getTaskInteropLink(rowA)).toEqual(link);
  });

  test('resolves unique/missing/duplicate identities deterministically', () => {
    const { dataSource, rowA, rowB } = createDbDataSource();
    const unique = createTodoTaskInteropLink({
      docId: 'd1',
      blockId: 'task-1',
    });
    const duplicate = createTodoTaskInteropLink({
      docId: 'd1',
      blockId: 'task-dup',
    });

    dataSource.setTaskInteropLink(
      rowA,
      createDatabaseRowTaskInteropLink({
        docId: unique.docId,
        blockId: unique.blockId,
        databaseId: 'db-1',
      })
    );

    expect(dataSource.findRowByTaskIdentity(unique.taskIdentity)).toEqual({
      status: 'unique',
      rowId: rowA,
    });

    expect(dataSource.findRowByTaskIdentity('missing:task')).toEqual({
      status: 'missing',
    });

    dataSource.setTaskInteropLink(
      rowA,
      createDatabaseRowTaskInteropLink({
        docId: duplicate.docId,
        blockId: duplicate.blockId,
        databaseId: 'db-1',
      })
    );
    dataSource.setTaskInteropLink(
      rowB,
      createDatabaseRowTaskInteropLink({
        docId: duplicate.docId,
        blockId: duplicate.blockId,
        databaseId: 'db-1',
      })
    );

    expect(dataSource.findRowByTaskIdentity(duplicate.taskIdentity)).toEqual({
      status: 'duplicate',
      rowIds: [rowA, rowB],
    });
  });
});
