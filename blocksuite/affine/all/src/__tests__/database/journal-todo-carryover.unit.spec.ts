import {
  addProperty,
  DatabaseBlockDataSource,
  databaseBlockProperties,
  getCell,
  updateCell,
} from '@blocksuite/affine-block-database';
import { copyUndoneTasks } from '@blocksuite/affine-block-database-view-ref';
import {
  type DatabaseBlockModel,
  DatabaseBlockSchemaExtension,
  ListBlockSchemaExtension,
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  RootBlockSchemaExtension,
} from '@blocksuite/affine-model';
import {
  createTaskIdentity,
  TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME,
  TASK_HIERARCHY_LEVEL_COLUMN_NAME,
  TASK_PARENT_IDENTIFIER_COLUMN_NAME,
} from '@blocksuite/affine-shared/utils';
import type { Store } from '@blocksuite/store';
import { Text } from '@blocksuite/store';
import {
  createAutoIncrementIdGenerator,
  TestWorkspace,
} from '@blocksuite/store/test';
import { beforeEach, describe, expect, test } from 'vitest';

/**
 * 999.19: copying undone tasks into a new Journal Todo table keeps their
 * hierarchy, re-pointed at the copies (identities name specific rows), and
 * leaves the previous table untouched.
 */

const extensions = [
  RootBlockSchemaExtension,
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  ListBlockSchemaExtension,
  DatabaseBlockSchemaExtension,
];

describe('copyUndoneTasks', () => {
  let doc: Store;
  let noteId: string;

  beforeEach(() => {
    const workspace = new TestWorkspace({
      id: 'test-collection',
      idGenerator: createAutoIncrementIdGenerator(),
    });
    workspace.meta.initialize();
    const blockSuiteDoc = workspace.createDoc('doc0');
    blockSuiteDoc.load();
    doc = blockSuiteDoc.getStore({ extensions });
    const rootId = doc.addBlock('affine:page', { title: new Text('t') });
    noteId = doc.addBlock('affine:note', {}, rootId);
  });

  const addTable = () =>
    doc.getModelById(
      doc.addBlock('affine:database', { columns: [], titleColumn: 'T' }, noteId)
    ) as DatabaseBlockModel;

  test('copies undone tasks with their hierarchy re-pointed at the copies', () => {
    const previous = addTable();
    const dataSource = new DatabaseBlockDataSource(previous);
    dataSource.ensureTaskStatusColumn();
    const levelColumnId = addProperty(
      previous,
      'end',
      databaseBlockProperties.numberColumnConfig.create(
        TASK_HIERARCHY_LEVEL_COLUMN_NAME
      )
    );
    const parentColumnId = addProperty(
      previous,
      'end',
      databaseBlockProperties.richTextColumnConfig.create(
        TASK_PARENT_IDENTIFIER_COLUMN_NAME
      )
    );
    addProperty(
      previous,
      'end',
      databaseBlockProperties.richTextColumnConfig.create(
        TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME
      )
    );
    const add = (text: string, level: number, done: boolean) => {
      const rowId = doc.addBlock(
        'affine:paragraph',
        { text: new Text(text) },
        previous.id
      );
      updateCell(previous, rowId, { columnId: levelColumnId, value: level });
      dataSource.setTaskStatusChecked(rowId, done);
      return rowId;
    };
    const parent = add('parent', 0, false);
    add('child', 1, false);
    add('done', 0, true);
    dataSource.applyPendingHierarchyLevel(parent);

    const next = addTable();
    new DatabaseBlockDataSource(next).ensureTaskStatusColumn();

    expect(copyUndoneTasks(previous, next)).toBe(2);

    const [parentCopy, childCopy] = next.children;
    expect(next.children.map(row => row.text?.toString())).toEqual([
      'parent',
      'child',
    ]);
    expect(getCell(next, childCopy!.id, levelColumnId)?.value).toBe(1);
    expect(String(getCell(next, childCopy!.id, parentColumnId)?.value)).toBe(
      createTaskIdentity({ docId: doc.id, blockId: parentCopy!.id })
    );
    const nextSource = new DatabaseBlockDataSource(next);
    expect(
      next.children.every(row => !nextSource.getTaskStatusInfo(row.id)?.checked)
    ).toBe(true);
    expect(previous.children.length).toBe(3);
  });

  test('copies nothing when every task is done', () => {
    const previous = addTable();
    const dataSource = new DatabaseBlockDataSource(previous);
    dataSource.ensureTaskStatusColumn();
    const rowId = doc.addBlock(
      'affine:paragraph',
      { text: new Text('done') },
      previous.id
    );
    dataSource.setTaskStatusChecked(rowId, true);
    const next = addTable();

    expect(copyUndoneTasks(previous, next)).toBe(0);
    expect(next.children.length).toBe(0);
  });
});
