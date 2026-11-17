import {
  addProperty,
  DatabaseBlockDataSource,
  databaseBlockProperties,
  getCell,
} from '@blocksuite/affine-block-database';
import {
  type DatabaseBlockModel,
  DatabaseBlockSchemaExtension,
  ListBlockSchemaExtension,
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  RootBlockSchemaExtension,
} from '@blocksuite/affine-model';
import {
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
 * 999.18: after every row move, `recomputeHierarchyMetadataAfterMove`
 * rewrote the Hierarchy Level / Parent / Ancestor cells of EVERY row (with
 * fresh `Text`s), changed or not. On a 298-row Journal Todo one drag took
 * 6 s in that recompute and wrote 85 KB of Yjs updates. Only cells whose
 * value actually changes may be written.
 */

const extensions = [
  RootBlockSchemaExtension,
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  ListBlockSchemaExtension,
  DatabaseBlockSchemaExtension,
];

const ROW_COUNT = 8;

describe('row moves write only the hierarchy cells that change', () => {
  let doc: Store;
  let db: DatabaseBlockModel;
  let dataSource: DatabaseBlockDataSource;
  let rowIds: string[];
  let hierarchyColumnIds: string[];

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
    const noteId = doc.addBlock('affine:note', {}, rootId);
    const databaseId = doc.addBlock(
      'affine:database',
      { columns: [], titleColumn: 'Title' },
      noteId
    );
    db = doc.getModelById(databaseId) as DatabaseBlockModel;
    hierarchyColumnIds = [
      addProperty(
        db,
        'end',
        databaseBlockProperties.numberColumnConfig.create(
          TASK_HIERARCHY_LEVEL_COLUMN_NAME
        )
      ),
      addProperty(
        db,
        'end',
        databaseBlockProperties.richTextColumnConfig.create(
          TASK_PARENT_IDENTIFIER_COLUMN_NAME
        )
      ),
      addProperty(
        db,
        'end',
        databaseBlockProperties.richTextColumnConfig.create(
          TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME
        )
      ),
    ];
    rowIds = Array.from({ length: ROW_COUNT }, (_, i) =>
      doc.addBlock(
        'affine:paragraph',
        { text: new Text(`row ${i}`) },
        databaseId
      )
    );
    dataSource = new DatabaseBlockDataSource(db);
    // Settle the hierarchy metadata once so every row has its cells.
    dataSource.rowMove(rowIds[0]!, { id: rowIds[1]!, before: true });
  });

  const cellEntry = (rowId: string, columnId: string) =>
    (db.yBlock.get('prop:cells') as any)?.get(rowId)?.get(columnId);

  test('a flat move leaves unaffected rows hierarchy cells untouched', () => {
    const before = new Map(
      rowIds.flatMap(rowId =>
        hierarchyColumnIds.map(columnId => [
          `${rowId}:${columnId}`,
          cellEntry(rowId, columnId),
        ])
      )
    );
    expect([...before.values()].every(Boolean)).toBe(true);

    // Move the last row to the top: every row stays at level 0 with no
    // parent, so no hierarchy value changes for any row.
    dataSource.rowMove(rowIds[ROW_COUNT - 1]!, {
      id: rowIds[0]!,
      before: true,
    });

    const rewritten = [...before].filter(
      ([key, entry]) =>
        cellEntry(...(key.split(':') as [string, string])) !== entry
    );
    expect(rewritten.map(([key]) => key)).toEqual([]);
    rowIds.forEach(rowId => {
      expect(getCell(db, rowId, hierarchyColumnIds[0]!)?.value).toBe(0);
    });
  });
});
