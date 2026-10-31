import {
  addProperty,
  convertToDatabase,
  DatabaseBlockDataSource,
  databaseBlockProperties,
  getCell,
  updateCell,
  updateCells,
} from '@blocksuite/affine-block-database';
import {
  type DatabaseBlockModel,
  DatabaseBlockSchemaExtension,
  ListBlockSchemaExtension,
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  RootBlockSchemaExtension,
} from '@blocksuite/affine-model';
import { propertyModelPresets } from '@blocksuite/data-view/property-pure-presets';
import type { Store } from '@blocksuite/store';
import { Text } from '@blocksuite/store';
import {
  createAutoIncrementIdGenerator,
  TestWorkspace,
} from '@blocksuite/store/test';
import { beforeEach, describe, expect, test } from 'vitest';

/**
 * Regression coverage for the production Journal Todo crash loop
 * (.planning/debug/prod-journal-crash-loop.md, 2026-10-16).
 *
 * `updateCell`/`updateCells` (and the `taskStatusState` writers in
 * `data-source.ts`) used to reassign the *whole* nested prop
 * (`model.props.cells = { ...cells, [rowId]: {...} }`) on every edit, so the
 * `cells$` signal would refresh synchronously. In Yjs every such
 * reassignment mints a brand-new `Y.Map` holding a full copy of the table and
 * deletes the previous one: the canonical Journal Todo database accumulated
 * 2,360 replaced copies of `prop:cells` (+270 of `prop:taskStatusState`),
 * ~116 MB in a local IndexedDB copy, and cold-loading any page referencing it
 * blocked the main thread for 10s+ (iOS killed the WebContent process).
 *
 * The first block of tests pins the storage shape (one Yjs item per prop
 * key, i.e. edits land *inside* the existing map). The second block pins the
 * reactivity the old workaround was protecting: a just-written cell must be
 * readable through `getCell` immediately (also mid-transaction, which the
 * task-status cascades rely on), and `cells$` subscribers must be notified.
 */

const extensions = [
  RootBlockSchemaExtension,
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  ListBlockSchemaExtension,
  DatabaseBlockSchemaExtension,
];

const statusOptions = [
  { id: 'not_done', value: 'Open', color: 'var(--affine-tag-yellow)' },
  { id: 'done', value: 'Finished', color: 'var(--affine-tag-green)' },
];

const ROW_COUNT = 6;
const EDIT_COUNT = 12;

type YMapLike = DatabaseBlockModel['yBlock'];

/**
 * Number of Yjs items ever written under `key` in `yMap` — the live one plus
 * every replaced (deleted) predecessor. Yjs links the items of one map key
 * through `left`, so for a block's `prop:cells` this is exactly the
 * "prop:cells: 2,361 items, 2,360 deleted" figure measured on the production
 * doc.
 */
function countKeyItems(yMap: YMapLike, key: string) {
  let item = yMap._map.get(key) ?? null;
  let count = 0;
  while (item) {
    count++;
    item = item.left;
  }
  return count;
}

function countPropItems(model: DatabaseBlockModel, key: string) {
  return countKeyItems(model.yBlock, key);
}

const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0));

describe('database cell writes stay in place (no whole-table copies)', () => {
  let workspace: TestWorkspace;
  let doc: Store;
  let noteId: string;
  let db: DatabaseBlockModel;
  let numberColumnId: string;
  let rowIds: string[];

  beforeEach(() => {
    workspace = new TestWorkspace({
      id: 'test-collection',
      idGenerator: createAutoIncrementIdGenerator(),
    });
    workspace.meta.initialize();
    const blockSuiteDoc = workspace.createDoc('doc0');
    blockSuiteDoc.load();
    doc = blockSuiteDoc.getStore({ extensions });

    const rootId = doc.addBlock('affine:page', { title: new Text('t') });
    noteId = doc.addBlock('affine:note', {}, rootId);
    const databaseId = doc.addBlock(
      'affine:database',
      { columns: [], titleColumn: 'Title' },
      noteId
    );
    db = doc.getModelById(databaseId) as DatabaseBlockModel;
    numberColumnId = addProperty(
      db,
      'end',
      databaseBlockProperties.numberColumnConfig.create('Number')
    );
    rowIds = Array.from({ length: ROW_COUNT }, (_, i) =>
      doc.addBlock(
        'affine:paragraph',
        { text: new Text(`row ${i}`) },
        databaseId
      )
    );
    // Seed every row so the cells map already holds a populated table.
    rowIds.forEach((rowId, i) => {
      updateCell(db, rowId, { columnId: numberColumnId, value: i });
    });
  });

  describe('storage shape', () => {
    test('updateCell edits the existing cells map instead of replacing it per edit', () => {
      const yCellsBefore = db.yBlock.get('prop:cells');

      for (let i = 0; i < EDIT_COUNT; i++) {
        updateCell(db, rowIds[i % ROW_COUNT]!, {
          columnId: numberColumnId,
          value: 100 + i,
        });
      }

      expect(db.yBlock.get('prop:cells')).toBe(yCellsBefore);
      expect(countPropItems(db, 'prop:cells')).toBe(1);
      expect(getCell(db, rowIds[0]!, numberColumnId)?.value).toBe(
        100 + EDIT_COUNT - ROW_COUNT
      );
    });

    test('updateCells edits the existing cells map instead of replacing it per call', () => {
      const yCellsBefore = db.yBlock.get('prop:cells');

      for (let i = 0; i < EDIT_COUNT; i++) {
        updateCells(
          db,
          numberColumnId,
          Object.fromEntries(rowIds.map(rowId => [rowId, 1000 + i]))
        );
      }

      expect(db.yBlock.get('prop:cells')).toBe(yCellsBefore);
      expect(countPropItems(db, 'prop:cells')).toBe(1);
      rowIds.forEach(rowId => {
        expect(getCell(db, rowId, numberColumnId)?.value).toBe(
          1000 + EDIT_COUNT - 1
        );
      });
    });

    test('task status toggles edit taskStatusState and cells in place', () => {
      addProperty(
        db,
        'end',
        propertyModelPresets.selectPropertyModelConfig.create('Status', {
          options: statusOptions,
        })
      );
      const dataSource = new DatabaseBlockDataSource(db);

      for (let i = 0; i < EDIT_COUNT; i++) {
        dataSource.setTaskStatusChecked(rowIds[i % ROW_COUNT]!, i % 2 === 0);
      }

      // `taskStatusState` starts out absent; the first status write creates
      // it once, every later one must land inside that same map.
      expect(countPropItems(db, 'prop:taskStatusState')).toBe(1);
      expect(countPropItems(db, 'prop:cells')).toBe(1);
      expect(dataSource.getTaskStatusInfo(rowIds[0]!)?.checked).toBe(true);
      expect(dataSource.getTaskStatusInfo(rowIds[1]!)?.checked).toBe(false);
    });

    test('re-asserting an unchanged task status does not rewrite its taskStatusState entry', () => {
      addProperty(
        db,
        'end',
        propertyModelPresets.selectPropertyModelConfig.create('Status', {
          options: statusOptions,
        })
      );
      const dataSource = new DatabaseBlockDataSource(db);
      const rowId = rowIds[0]!;

      dataSource.setTaskStatusChecked(rowId, true);
      dataSource.setTaskStatusChecked(rowId, true);
      dataSource.setTaskStatusChecked(rowId, true);

      const yStates = db.yBlock.get('prop:taskStatusState') as YMapLike;
      expect(countKeyItems(yStates, rowId)).toBe(1);
      expect(db.props.taskStatusState?.[rowId]).toEqual({
        provenance: 'manual',
        manualLock: 'done_locked',
      });
    });

    test('converting checked todos to a database writes taskStatusState once, not once per row', () => {
      const todoIds = Array.from({ length: ROW_COUNT }, (_, i) =>
        doc.addBlock(
          'affine:list',
          { type: 'todo', checked: true, text: new Text(`todo ${i}`) },
          noteId
        )
      );
      const selectedModels = todoIds.map(id => doc.getModelById(id));

      convertToDatabase(
        {
          store: doc,
          selection: { clear: () => {} },
          std: {
            command: { exec: () => [null, { selectedModels }] },
            getOptional: () => ({
              setting$: {
                peek: () => ({ taskWorkflowDefaults: {} }),
                get value() {
                  return { taskWorkflowDefaults: {} };
                },
              },
            }),
          },
        } as never,
        'table'
      );

      const converted = doc
        .getModelById(noteId)
        ?.children.find(
          child => child.flavour === 'affine:database' && child.id !== db.id
        ) as DatabaseBlockModel | undefined;
      expect(converted).toBeTruthy();

      const convertedRowIds = converted!.children.map(child => child.id);
      expect(convertedRowIds).toHaveLength(ROW_COUNT);
      convertedRowIds.forEach(rowId => {
        expect(converted!.props.taskStatusState?.[rowId]).toEqual({
          provenance: 'manual',
          manualLock: 'done_locked',
        });
      });
      expect(countPropItems(converted!, 'prop:taskStatusState')).toBe(1);
      expect(countPropItems(converted!, 'prop:cells')).toBe(1);
    });
  });

  describe('reactivity (what the whole-prop reassignment used to protect)', () => {
    test('getCell reads a just-written cell immediately, also inside an enclosing transaction', () => {
      // Make sure `cells$` already holds a refreshed snapshot (not the
      // initial live proxy it starts out aliasing), as in a long-lived page.
      updateCell(db, rowIds[0]!, { columnId: numberColumnId, value: -1 });

      updateCell(db, rowIds[0]!, { columnId: numberColumnId, value: 41 });
      expect(getCell(db, rowIds[0]!, numberColumnId)?.value).toBe(41);

      doc.transact(() => {
        updateCell(db, rowIds[1]!, { columnId: numberColumnId, value: 42 });
        expect(getCell(db, rowIds[1]!, numberColumnId)?.value).toBe(42);
        updateCells(db, numberColumnId, {
          [rowIds[2]!]: 43,
          [rowIds[3]!]: 44,
        });
        expect(getCell(db, rowIds[2]!, numberColumnId)?.value).toBe(43);
        expect(getCell(db, rowIds[3]!, numberColumnId)?.value).toBe(44);
      });
      expect(getCell(db, rowIds[1]!, numberColumnId)?.value).toBe(42);
    });

    test('getCell reads a just-written rich-text cell with its integrated content', () => {
      const textColumnId = addProperty(
        db,
        'end',
        databaseBlockProperties.richTextColumnConfig.create('Text')
      );
      updateCell(db, rowIds[0]!, {
        columnId: textColumnId,
        value: new Text('first'),
      });
      updateCell(db, rowIds[0]!, {
        columnId: textColumnId,
        value: new Text('parent-identity'),
      });

      const value = getCell(db, rowIds[0]!, textColumnId)?.value;
      expect(value).toBeInstanceOf(Text);
      expect((value as Text).toString()).toBe('parent-identity');
    });

    test('cells$ consumers re-run when a status checkbox is toggled (re-render)', async () => {
      const statusColumnId = addProperty(
        db,
        'end',
        propertyModelPresets.selectPropertyModelConfig.create('Status', {
          options: statusOptions,
        })
      );
      const dataSource = new DatabaseBlockDataSource(db);
      const rowId = rowIds[0]!;
      const seen: unknown[] = [];
      // `subscribe` runs on every `cells$` notification, like a
      // `SignalWatcher` cell re-rendering and reading through `getCell`.
      const dispose = db.props.cells$.subscribe(() => {
        seen.push(getCell(db, rowId, statusColumnId)?.value ?? null);
      });

      try {
        dataSource.setTaskStatusChecked(rowId, true);
        await flushMicrotasks();
        expect(seen.at(-1)).toBe('done');

        dataSource.setTaskStatusChecked(rowId, false);
        await flushMicrotasks();
        expect(seen.at(-1)).toBe('not_done');

        dataSource.setTaskStatusChecked(rowId, true);
        await flushMicrotasks();
        expect(seen.at(-1)).toBe('done');
      } finally {
        dispose();
      }
    });

    function openSecondStore() {
      // A database rendered in two places at once (e.g. a Journal Todo
      // reference plus its canonical table) gets one SyncController per
      // Store over the same Yjs block.
      const secondStore = workspace
        .getDoc('doc0')!
        .getStore({ extensions, id: 'second-store' });
      const dbInSecondStore = secondStore.getModelById(
        db.id
      ) as DatabaseBlockModel;
      expect(dbInSecondStore).toBeTruthy();
      expect(dbInSecondStore).not.toBe(db);
      return dbInSecondStore;
    }

    test('a cell write through one Store re-renders the same database rendered through a second Store', async () => {
      const dbInSecondStore = openSecondStore();
      const rowId = rowIds[2]!;
      const seen: unknown[] = [];
      const dispose = dbInSecondStore.props.cells$.subscribe(() => {
        seen.push(getCell(dbInSecondStore, rowId, numberColumnId)?.value);
      });

      try {
        updateCell(db, rowId, { columnId: numberColumnId, value: 77 });
        await flushMicrotasks();
        expect(seen.at(-1)).toBe(77);

        updateCell(db, rowId, { columnId: numberColumnId, value: 78 });
        await flushMicrotasks();
        expect(seen.at(-1)).toBe(78);
      } finally {
        dispose();
      }
    });

    test('getCell through a second Store reads a cell written through the first one immediately', () => {
      const dbInSecondStore = openSecondStore();
      const rowId = rowIds[2]!;

      updateCell(db, rowId, { columnId: numberColumnId, value: 77 });
      expect(getCell(dbInSecondStore, rowId, numberColumnId)?.value).toBe(77);

      updateCell(dbInSecondStore, rowId, {
        columnId: numberColumnId,
        value: 78,
      });
      expect(getCell(db, rowId, numberColumnId)?.value).toBe(78);
    });
  });
});
