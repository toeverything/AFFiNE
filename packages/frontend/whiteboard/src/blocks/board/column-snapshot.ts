export type BoardSnapshotRow = {
  id: string;
  title: string;
};

export type BoardSnapshotOption = {
  id: string;
  value: string;
  color?: string;
};

export type BoardSnapshotColumn = {
  id: string;
  type: string;
  name: string;
  data?: {
    options?: BoardSnapshotOption[];
  };
};

export type BoardSnapshotView = {
  id: string;
  mode: string;
  groupBy?: {
    columnId?: string;
    hideEmpty?: boolean;
  };
  groupProperties?: Array<{
    key: string;
    hide?: boolean;
    manuallyCardSort?: string[];
  }>;
};

export type BoardSnapshotInput = {
  columns: BoardSnapshotColumn[];
  cells: Record<string, Record<string, { value?: unknown } | unknown>>;
  views: BoardSnapshotView[];
  rows: BoardSnapshotRow[];
};

export type BoardColumnPreview = {
  id: string;
  name: string;
  color: string;
  count: number;
  cards: BoardSnapshotRow[];
};

const FALLBACK_COLOR = 'var(--affine-tag-gray)';

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

function pickGroupColumn(
  columns: BoardSnapshotColumn[],
  views: BoardSnapshotView[]
) {
  const kanban = views.find(view => view.mode === 'kanban');
  const byId = kanban?.groupBy?.columnId;
  if (byId) {
    return columns.find(column => column.id === byId);
  }
  return columns.find(column => column.type === 'select');
}

function sortRows(rows: BoardSnapshotRow[], order?: string[]) {
  if (!order?.length) return rows;
  const index = new Map(order.map((id, i) => [id, i]));
  return [...rows].sort(
    (a, b) => (index.get(a.id) ?? 1e9) - (index.get(b.id) ?? 1e9)
  );
}

export function readBoardColumns(
  input: BoardSnapshotInput
): BoardColumnPreview[] {
  const groupColumn = pickGroupColumn(input.columns, input.views);
  const kanban = input.views.find(view => view.mode === 'kanban');
  const hideEmpty = kanban?.groupBy?.hideEmpty ?? false;
  const groupProperties = kanban?.groupProperties ?? [];

  if (!groupColumn) {
    return [
      {
        id: 'ungrouped',
        name: '',
        color: FALLBACK_COLOR,
        count: input.rows.length,
        cards: input.rows,
      },
    ];
  }

  const options = groupColumn.data?.options ?? [];
  const optionMap = new Map(options.map(option => [option.id, option]));
  const buckets = new Map<string, BoardSnapshotRow[]>();
  for (const option of options) {
    buckets.set(option.id, []);
  }
  const ungrouped: BoardSnapshotRow[] = [];

  for (const row of input.rows) {
    const value = cellValue(input.cells, row.id, groupColumn.id);
    const key = typeof value === 'string' ? value : '';
    const bucket = key ? buckets.get(key) : undefined;
    if (bucket) {
      bucket.push(row);
    } else {
      ungrouped.push(row);
    }
  }

  const hidden = new Set(
    groupProperties.filter(property => property.hide).map(property => property.key)
  );
  const propOrder = groupProperties.map(property => property.key);
  const optionIds = options.map(option => option.id);
  const orderedIds = propOrder.length
    ? [
        ...propOrder.filter(id => optionMap.has(id)),
        ...optionIds.filter(id => !propOrder.includes(id)),
      ]
    : optionIds;

  const columns: BoardColumnPreview[] = [];
  for (const id of orderedIds) {
    if (hidden.has(id)) continue;
    const option = optionMap.get(id);
    if (!option) continue;
    const cards = sortRows(
      buckets.get(id) ?? [],
      groupProperties.find(property => property.key === id)?.manuallyCardSort
    );
    if (hideEmpty && cards.length === 0) continue;
    columns.push({
      id,
      name: option.value,
      color: option.color || FALLBACK_COLOR,
      count: cards.length,
      cards,
    });
  }

  if (ungrouped.length && !hidden.has('ungrouped')) {
    columns.push({
      id: 'ungrouped',
      name: '',
      color: FALLBACK_COLOR,
      count: ungrouped.length,
      cards: ungrouped,
    });
  }

  return columns;
}

export function databaseToSnapshot(database: {
  children: Array<{
    id: string;
    props: { text?: { toString?: () => string } };
  }>;
  props: {
    columns: BoardSnapshotColumn[];
    cells: BoardSnapshotInput['cells'];
    views: BoardSnapshotView[];
  };
}): BoardSnapshotInput {
  return {
    columns: database.props.columns ?? [],
    cells: database.props.cells ?? {},
    views: database.props.views ?? [],
    rows: database.children.map(child => ({
      id: child.id,
      title: child.props.text?.toString?.() ?? '',
    })),
  };
}
