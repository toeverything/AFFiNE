import {
  type BoardColumnPreview,
  type BoardSnapshotInput,
  type BoardSnapshotOption,
  type BoardSnapshotRow,
  type BoardSnapshotView,
  readBoardColumns,
} from './column-snapshot';
import {
  attachmentCount,
  BOARD_CHECKLIST_COLUMN,
  type BoardGroupByAxes,
  type BoardTask,
  type BoardWipLimits,
  checklistProgress,
  laneValue,
  parseTasks,
  readGroupByAxes,
} from './semantics';

export type BoardLanePreview = {
  id: string;
  name: string;
};

export type BoardGridCell = {
  x: string;
  y: string;
  cards: BoardCardPreview[];
};

export type BoardCardPreview = BoardSnapshotRow & {
  tasks: BoardTask[];
  timeSpent?: number;
  attachmentCount: number;
  checklist?: { done: number; total: number };
};

export type BoardGrid = {
  axes: BoardGroupByAxes;
  columns: BoardColumnPreview[];
  lanes: BoardLanePreview[];
  cells: BoardGridCell[];
  wipLimits: BoardWipLimits;
};

const UNGROUPED = '';

function kanbanView(views: BoardSnapshotView[]) {
  return views.find(view => view.mode === 'kanban');
}

function cellValue(
  cells: BoardSnapshotInput['cells'],
  rowId: string,
  columnId: string
): unknown {
  const cell = cells[rowId]?.[columnId];
  if (cell && typeof cell === 'object' && 'value' in cell) {
    return (cell as { value?: unknown }).value;
  }
  return cell;
}

function optionsOf(column?: { data?: { options?: BoardSnapshotOption[] } }) {
  return column?.data?.options ?? [];
}

function collectLanes(
  input: BoardSnapshotInput,
  yColumnId: string | undefined
): BoardLanePreview[] {
  if (!yColumnId) return [{ id: UNGROUPED, name: '' }];
  const column = input.columns.find(item => item.id === yColumnId);
  const fromOptions = optionsOf(column).map(option => ({
    id: option.id,
    name: option.value,
  }));
  const seen = new Set(fromOptions.map(lane => lane.id));
  const extra: BoardLanePreview[] = [];
  for (const row of input.rows) {
    const key = laneValue(cellValue(input.cells, row.id, yColumnId));
    if (!key) {
      continue;
    }
    if (!seen.has(key)) {
      seen.add(key);
      extra.push({ id: key, name: key });
    }
  }
  const lanes = [...fromOptions, ...extra];
  if (!lanes.some(lane => lane.id === UNGROUPED)) {
    lanes.push({ id: UNGROUPED, name: '' });
  }
  return lanes;
}

function enrichCard(
  row: BoardSnapshotRow,
  input: BoardSnapshotInput
): BoardCardPreview {
  const timeColumn = input.columns.find(column => column.type === 'number');
  const fileColumn = input.columns.find(
    column => column.type === 'attachment' || column.type === 'file'
  );
  const tasks = row.tasks?.length
    ? row.tasks
    : parseTasks(
        cellValue(
          input.cells,
          row.id,
          input.columns.find(column => column.name === BOARD_CHECKLIST_COLUMN)
            ?.id ?? ''
        )
      );
  const spent = timeColumn
    ? Number(cellValue(input.cells, row.id, timeColumn.id))
    : undefined;
  const files = fileColumn
    ? attachmentCount(cellValue(input.cells, row.id, fileColumn.id))
    : 0;
  return {
    ...row,
    tasks,
    timeSpent: Number.isFinite(spent) ? spent : undefined,
    attachmentCount: files,
    checklist: tasks.length ? checklistProgress(tasks) : undefined,
  };
}

export function readBoardGrid(input: BoardSnapshotInput): BoardGrid {
  const view = kanbanView(input.views);
  const axes = readGroupByAxes(view);
  const columns = readBoardColumns(input);
  const lanes = collectLanes(input, axes.y);
  const cells: BoardGridCell[] = [];

  for (const column of columns) {
    for (const lane of lanes) {
      const cards = column.cards
        .filter(card => {
          if (!axes.y) return lane.id === UNGROUPED;
          return laneValue(cellValue(input.cells, card.id, axes.y)) === lane.id;
        })
        .map(card => enrichCard(card, input));
      cells.push({ x: column.id, y: lane.id, cards });
    }
  }

  return {
    axes,
    columns,
    lanes,
    cells,
    wipLimits: view?.wipLimits ?? {},
  };
}

export function cardsInColumn(grid: BoardGrid, columnId: string) {
  return grid.cells
    .filter(cell => cell.x === columnId)
    .reduce((sum, cell) => sum + cell.cards.length, 0);
}
