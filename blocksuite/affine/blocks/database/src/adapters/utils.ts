import type { ColumnDataType, SerializedCells } from '@blocksuite/affine-model';
import type { BlockSnapshot, DeltaInsert } from '@blocksuite/store';

import { databaseBlockModels } from '../properties/model';

function calculateColumnWidths(rows: string[][]): number[] {
  return (
    rows[0]?.map((_, colIndex) =>
      Math.max(...rows.map(row => (row[colIndex] || '').length))
    ) ?? []
  );
}

function formatRow(
  row: string[],
  columnWidths: number[],
  isHeader: boolean
): string {
  const cells = row.map((cell, colIndex) =>
    cell?.padEnd(columnWidths[colIndex] ?? 0, ' ')
  );
  const rowString = `| ${cells.join(' | ')} |`;
  return isHeader
    ? `${rowString}\n${formatSeparator(columnWidths)}`
    : rowString;
}

function formatSeparator(columnWidths: number[]): string {
  const separator = columnWidths.map(width => '-'.repeat(width)).join(' | ');
  return `| ${separator} |`;
}

export function formatTable(rows: string[][]): string {
  const columnWidths = calculateColumnWidths(rows);
  const formattedRows = rows.map((row, index) =>
    formatRow(row, columnWidths, index === 0)
  );
  return formattedRows.join('\n');
}
export const isDelta = (value: unknown): value is { delta: DeltaInsert[] } => {
  if (typeof value === 'object' && value !== null) {
    return '$blocksuite:internal:text$' in value;
  }
  return false;
};
type Table = {
  headers: ColumnDataType[];
  rows: Row[];
};
type Row = {
  cells: Cell[];
};
type Cell = {
  value: string | { delta: DeltaInsert[] };
};
export const processTable = (
  columns: ColumnDataType[] = [],
  children: BlockSnapshot[] = [],
  cells: SerializedCells = {}
): Table => {
  // Every row is built as [row title, ...non-title columns], so the headers
  // must use that same order. Passing the raw columns array put each name
  // above the wrong column whenever the title column was not first.
  const titleColumn = columns.find(col => col.type === 'title');
  const valueColumns = columns.filter(col => col.type !== 'title');
  const table: Table = {
    headers: [
      {
        ...(titleColumn ?? { id: 'title', type: 'title', data: {} }),
        name: titleColumn?.name ?? 'Title',
      } as ColumnDataType,
      ...valueColumns,
    ],
    rows: [],
  };
  children.forEach(v => {
    const row: Row = {
      cells: [],
    };
    const title = v.props.text;
    if (isDelta(title)) {
      row.cells.push({
        value: title,
      });
    } else {
      row.cells.push({
        value: '',
      });
    }

    valueColumns.forEach(col => {
      const property = databaseBlockModels[col.type];
      const cell = cells[v.id]?.[col.id];
      if (!cell || !property) {
        row.cells.push({
          value: '',
        });
        return;
      }
      let value: string | { delta: DeltaInsert[] };
      try {
        if (isDelta(cell.value)) {
          value = cell.value;
        } else {
          // An empty cell can stringify to undefined, which is not a throw,
          // so the catch below does not cover it. Every adapter then reads
          // value.delta and fails, and the whole export aborts.
          value =
            property.config.rawValue.toString({
              value: cell.value,
              data: col.data,
            }) ?? '';
        }
      } catch {
        value = '';
      }
      row.cells.push({
        value,
      });
    });
    table.rows.push(row);
  });

  return table;
};
