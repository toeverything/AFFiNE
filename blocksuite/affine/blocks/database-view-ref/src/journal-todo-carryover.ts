import {
  DatabaseBlockDataSource,
  getCell,
  updateCell,
  updateTaskStatusState,
} from '@blocksuite/affine-block-database';
import { toast } from '@blocksuite/affine-components/toast';
import type { DatabaseBlockModel } from '@blocksuite/affine-model';
import { NotificationProvider } from '@blocksuite/affine-shared/services';
import {
  ensureDocLoaded,
  TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME,
  TASK_PARENT_IDENTIFIER_COLUMN_NAME,
  waitForBlockInDoc,
} from '@blocksuite/affine-shared/utils';
import type { BlockStdScope } from '@blocksuite/std';
import { Text } from '@blocksuite/store';

/** Rows of `table` whose task status is not done, in table order. */
export function getUndoneTaskRowIds(table: DatabaseBlockModel): string[] {
  const dataSource = new DatabaseBlockDataSource(table);
  return table.children
    .map(row => row.id)
    .filter(rowId => {
      const info = dataSource.getTaskStatusInfo(rowId);
      return !!info && !info.checked;
    });
}

const copyValue = (value: unknown): unknown => {
  if (value instanceof Text) return value.clone();
  if (value == null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
};

/**
 * Copies the undone tasks of `from` into the (new, empty) table `to`: its
 * columns (so status options and their ids carry over), then one new row
 * per undone task with its text, cell values and status state. Parent /
 * ancestor identities point at specific rows, so they are recomputed for
 * the copies instead of copied. `from` is not modified. Returns the number
 * of tasks copied.
 */
export function copyUndoneTasks(
  from: DatabaseBlockModel,
  to: DatabaseBlockModel
): number {
  const rowIds = getUndoneTaskRowIds(from);
  if (rowIds.length === 0) return 0;

  const identityColumnIds = new Set(
    from.props.columns
      .filter(
        column =>
          column.name === TASK_PARENT_IDENTIFIER_COLUMN_NAME ||
          column.name === TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME
      )
      .map(column => column.id)
  );
  const store = to.store;
  const copiedRowIds: string[] = [];

  store.transact(() => {
    // `to` was created moments ago with only a default status column and no
    // rows, so taking over `from`'s column list wholesale is safe here.
    to.props.columns = from.props.columns.map(
      column => copyValue(column) as (typeof from.props.columns)[number]
    );

    for (const rowId of rowIds) {
      const row = from.store.getModelById(rowId);
      if (!row) continue;
      const props = row.props as { text?: Text; type?: string };
      const newRowId = store.addBlock(
        row.flavour,
        {
          text: props.text ? props.text.clone() : new Text(),
          ...(props.type ? { type: props.type } : {}),
        },
        to.id
      );
      copiedRowIds.push(newRowId);

      for (const column of from.props.columns) {
        if (identityColumnIds.has(column.id)) continue;
        const cell = getCell(from, rowId, column.id);
        if (cell?.value === undefined) continue;
        updateCell(to, newRowId, {
          columnId: column.id,
          value: copyValue(cell.value),
        });
      }
      const state = from.props.taskStatusState?.[rowId];
      if (state) {
        updateTaskStatusState(to, newRowId, { ...state });
      }
    }
  });

  const firstRowId = copiedRowIds[0];
  if (firstRowId && identityColumnIds.size > 0) {
    new DatabaseBlockDataSource(to).applyPendingHierarchyLevel(firstRowId);
  }
  return copiedRowIds.length;
}

async function resolveTable(
  std: BlockStdScope,
  ref: { refDocId: string; refBlockId: string }
): Promise<DatabaseBlockModel | null> {
  let store = ref.refDocId === std.store.id ? std.store : undefined;
  if (!store) {
    // Same cross-doc resolution as `insertJournalTodoReference`.
    const refDoc = std.workspace.getDoc(ref.refDocId);
    if (!refDoc) return null;
    ensureDocLoaded(refDoc);
    if (!(await waitForBlockInDoc(refDoc, ref.refBlockId))) return null;
    store = refDoc.getStore({ id: refDoc.id });
  }
  const model = store.getBlock(ref.refBlockId)?.model;
  return model?.flavour === 'affine:database'
    ? (model as DatabaseBlockModel)
    : null;
}

/**
 * When a new Journal Todo table replaces `previousRef`, ask whether to copy
 * the previous table's undone tasks into it (999.19). Does nothing when
 * there is no previous table, no undone task, or no way to ask.
 */
export async function offerToCopyUndoneTasks(
  std: BlockStdScope,
  previousRef: { refDocId: string; refBlockId: string },
  newTable: DatabaseBlockModel
): Promise<void> {
  const notification = std.getOptional(NotificationProvider);
  if (!notification) return;
  const previous = await resolveTable(std, previousRef);
  if (!previous || previous.id === newTable.id) return;

  const count = getUndoneTaskRowIds(previous).length;
  if (count === 0) return;

  const tasks = count === 1 ? '1 undone task' : `${count} undone tasks`;
  const accepted = await notification.confirm({
    title: 'Copy undone tasks?',
    message: `Copy ${tasks} from your previous Journal Todo table into the new one? The previous table is left as it is.`,
    confirmText: 'Copy',
    cancelText: "Don't copy",
  });
  if (!accepted) return;

  const copied = copyUndoneTasks(previous, newTable);
  toast(
    std.host,
    copied === 1 ? 'Copied 1 undone task.' : `Copied ${copied} undone tasks.`
  );
}
