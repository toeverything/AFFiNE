import type {
  CellDataType,
  ColumnDataType,
  ColumnUpdater,
  DatabaseBlockModel,
  DatabaseBlockProps,
  ViewBasicDataType,
} from '@blocksuite/affine-model';
import {
  arrayMove,
  insertPositionToIndex,
  type InsertToPosition,
} from '@blocksuite/affine-shared/utils';
import type { BlockModel } from '@blocksuite/store';

export function addProperty(
  model: DatabaseBlockModel,
  position: InsertToPosition,
  column: Omit<ColumnDataType, 'id'> & {
    id?: string;
  }
): string {
  const id = column.id ?? model.store.workspace.idGenerator();
  if (model.props.columns.some(v => v.id === id)) {
    return id;
  }
  model.store.transact(() => {
    const col: ColumnDataType = {
      ...column,
      id,
    };
    model.props.columns.splice(
      insertPositionToIndex(position, model.props.columns),
      0,
      col
    );
  });
  return id;
}

export function copyCellsByProperty(
  model: DatabaseBlockModel,
  fromId: ColumnDataType['id'],
  toId: ColumnDataType['id']
) {
  model.store.transact(() => {
    Object.keys(model.props.cells).forEach(rowId => {
      const cell = model.props.cells[rowId]?.[fromId];
      if (cell && model.props.cells[rowId]) {
        model.props.cells[rowId][toId] = {
          ...cell,
          columnId: toId,
        };
      }
    });
  });
}

export function deleteColumn(
  model: DatabaseBlockModel,
  columnId: ColumnDataType['id']
) {
  const index = model.props.columns.findIndex(v => v.id === columnId);
  if (index < 0) return;

  model.store.transact(() => {
    model.props.columns.splice(index, 1);
  });
}

export function deleteRows(model: DatabaseBlockModel, rowIds: string[]) {
  model.store.transact(() => {
    for (const rowId of rowIds) {
      delete model.props.cells[rowId];
    }
  });
}

export function deleteView(model: DatabaseBlockModel, id: string) {
  model.store.captureSync();
  model.store.transact(() => {
    model.props.views = model.props.views.filter(v => v.id !== id);
  });
}

export function duplicateView(model: DatabaseBlockModel, id: string): string {
  const newId = model.store.workspace.idGenerator();
  model.store.transact(() => {
    const index = model.props.views.findIndex(v => v.id === id);
    const view = model.props.views[index];
    if (view) {
      model.props.views.splice(
        index + 1,
        0,
        JSON.parse(JSON.stringify({ ...view, id: newId }))
      );
    }
  });
  return newId;
}

export function getCell(
  model: DatabaseBlockModel,
  rowId: BlockModel['id'],
  columnId: ColumnDataType['id']
): CellDataType | null {
  if (columnId === 'title') {
    return {
      columnId: 'title',
      value: rowId,
    };
  }
  // Read `cells$` so signal consumers (computeds, `SignalWatcher` cells) stay
  // subscribed to cell changes, but take the value from the live reactive
  // `cells` prop. `cells$` holds a snapshot that is only refreshed once the
  // outermost Yjs transaction closes (and for sibling Stores of the same
  // block, a microtask after that), so right after an in-place
  // `updateCell`, and anywhere inside an enclosing `store.transact()` (the
  // task-status cascades read back cells they have just written), the
  // snapshot is stale. The live prop reflects every write immediately and is
  // shared by every Store over this block. Same reasoning as
  // `getNormalPropertyAndIndex` reading `props.columns` in `data-source.ts`.
  const trackedCells = model.props.cells$.value;
  const yRow = (model.props.cells ?? trackedCells)[rowId];
  const yCell = yRow?.[columnId] ?? null;
  if (!yCell) return null;

  return {
    columnId: yCell.columnId,
    value: yCell.value,
  };
}

export function getProperty(
  model: DatabaseBlockModel,
  id: ColumnDataType['id']
): ColumnDataType | undefined {
  return model.props.columns.find(v => v.id === id);
}

export function moveViewTo(
  model: DatabaseBlockModel,
  id: string,
  position: InsertToPosition
) {
  model.store.transact(() => {
    model.props.views = arrayMove(
      model.props.views,
      v => v.id === id,
      arr => insertPositionToIndex(position, arr)
    );
  });
}

export function updateCell(
  model: DatabaseBlockModel,
  rowId: string,
  cell: CellDataType
) {
  model.store.transact(() => {
    const columnId = cell.columnId;
    if (
      rowId === '__proto__' ||
      rowId === 'constructor' ||
      rowId === 'prototype'
    ) {
      console.error('Invalid rowId');
      return;
    }
    if (
      columnId === '__proto__' ||
      columnId === 'constructor' ||
      columnId === 'prototype'
    ) {
      console.error('Invalid columnId');
      return;
    }
    // Write the single cell in place. Never reassign the whole `cells` prop
    // here: every top-level reassignment mints a brand-new Y.Map holding a
    // full copy of the table and deletes the previous one, so each edit
    // would add a whole-table copy to the doc history (the canonical
    // Journal Todo table reached 2,360 copies, ~116 MB locally, and
    // cold-loading it froze/crashed the page). `getCell` reads the live
    // prop, so the write is visible immediately, and the Yjs observer
    // refreshes `cells$` for signal consumers.
    if (!model.props.cells[rowId]) {
      model.props.cells[rowId] = Object.create(null);
    }
    const row = model.props.cells[rowId];
    if (row) {
      row[columnId] = {
        columnId,
        value: cell.value,
      };
    }
  });
}

export function updateCells(
  model: DatabaseBlockModel,
  columnId: string,
  cells: Record<string, unknown>
) {
  model.store.transact(() => {
    Object.entries(cells).forEach(([rowId, value]) => {
      if (
        rowId === '__proto__' ||
        rowId === 'constructor' ||
        rowId === 'prototype'
      ) {
        throw new Error('Invalid rowId');
      }
      // In place, one cell at a time — see `updateCell` for why the whole
      // `cells` prop must not be reassigned.
      if (!model.props.cells[rowId]) {
        model.props.cells[rowId] = Object.create(null);
      }
      const row = model.props.cells[rowId];
      if (row) {
        row[columnId] = {
          columnId,
          value,
        };
      }
    });
  });
}

export type TaskStatusRowState = NonNullable<
  DatabaseBlockProps['taskStatusState']
>[string];

/**
 * Sets one row's entry in `taskStatusState` in place. Like `updateCell`, this
 * must not reassign the whole prop: each reassignment adds a full copy of
 * every row's state to the doc history. Only the very first write (while the
 * prop is still absent) creates the map. Unchanged states are skipped so
 * re-asserting a row's state does not churn its entry either.
 */
export function updateTaskStatusState(
  model: DatabaseBlockModel,
  rowId: string,
  state: TaskStatusRowState
) {
  if (
    rowId === '__proto__' ||
    rowId === 'constructor' ||
    rowId === 'prototype'
  ) {
    console.error('Invalid rowId');
    return;
  }
  model.store.transact(() => {
    const states = model.props.taskStatusState;
    if (!states) {
      model.props.taskStatusState = { [rowId]: { ...state } };
      return;
    }
    const existing = states[rowId];
    if (
      existing?.provenance === state.provenance &&
      existing.manualLock === state.manualLock
    ) {
      return;
    }
    states[rowId] = { ...state };
  });
}

export function updateProperty(
  model: DatabaseBlockModel,
  id: string,
  updater: ColumnUpdater,
  defaultValue?: Record<string, unknown>
) {
  const index = model.props.columns.findIndex(v => v.id === id);
  if (index == null) {
    return;
  }
  model.store.transact(() => {
    const column = model.props.columns[index];
    if (!column) {
      return;
    }
    const result = updater(column);
    model.props.columns[index] = { ...defaultValue, ...column, ...result };
  });
  return id;
}

export const updateView = <ViewData extends ViewBasicDataType>(
  model: DatabaseBlockModel,
  id: string,
  update: (data: ViewData) => Partial<ViewData>
) => {
  model.store.transact(() => {
    model.props.views = model.props.views.map(v => {
      if (v.id !== id) {
        return v;
      }
      return { ...v, ...update(v as ViewData) };
    });
  });
};
export const DATABASE_CONVERT_WHITE_LIST = ['affine:list', 'affine:paragraph'];
