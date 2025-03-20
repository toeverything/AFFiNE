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
  columns: ColumnDataType[],
  children: BlockSnapshot[],
  cells: SerializedCells
): Table => {
  const table: Table = {
    headers: columns,
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

    columns.forEach(col => {
      const property = databaseBlockModels[col.type];
      const cell = cells[v.id]?.[col.id];
      if (col.type === 'title') {
        return;
      }
      if (!cell || !property) {
        row.cells.push({
          value: '',
        });
        return;
      }
      let value: string | { delta: DeltaInsert[] };
      if (isDelta(cell.value)) {
        value = cell.value;
      } else {
        value = property.config.rawValue.toString({
          value: cell.value,
          data: col.data,
        });
      }
      row.cells.push({
        value,
      });
    });
    table.rows.push(row);
  });

  return table;
};
