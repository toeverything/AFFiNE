import type {
  ChartDataset,
  ChartInlineTable,
  ChartMapping,
  DatabaseTableSnapshot,
} from './types';

export const INLINE_CELL_LIMIT = 200;

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function cellToScalar(value: unknown): string | number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const numeric = asFiniteNumber(value);
    return numeric ?? value;
  }
  if (Array.isArray(value)) {
    return value.map(item => String(item)).join(', ');
  }
  if (typeof value === 'object') {
    if ('value' in value) return cellToScalar((value as { value: unknown }).value);
    if ('text' in value) return cellToScalar((value as { text: unknown }).text);
    return JSON.stringify(value);
  }
  return String(value);
}

function resolveColumn(
  columns: Array<{ id: string; name: string }>,
  key: string
): { id: string; name: string } | undefined {
  return columns.find(column => column.id === key || column.name === key);
}

export function inferMapping(
  columns: Array<{ id: string; name: string; type?: string }>,
  sampleRow?: Record<string, unknown>
): ChartMapping {
  if (!columns.length) {
    return { x: '', y: [] };
  }

  const numericTypes = new Set([
    'number',
    'progress',
    'checkbox',
    'num',
  ]);

  const numeric = columns.filter(column => {
    if (column.type && numericTypes.has(column.type)) return true;
    if (!sampleRow) return false;
    return asFiniteNumber(sampleRow[column.id] ?? sampleRow[column.name]) != null;
  });

  const x =
    columns.find(column => !numeric.includes(column)) ?? columns[0];
  const y = (numeric.length ? numeric : columns.filter(column => column !== x))
    .map(column => column.id)
    .filter(id => id !== x.id);

  return { x: x.id, y };
}

export function mapInlineTable(
  table: ChartInlineTable | undefined,
  mapping: ChartMapping
): ChartDataset {
  const columns = table?.columns ?? [];
  const rows = table?.rows ?? [];
  const limitedRows = limitCells(columns, rows);
  const xIndex = columns.indexOf(mapping.x);
  const yIndexes = mapping.y
    .map(name => columns.indexOf(name))
    .filter(index => index >= 0);

  const dimensions = [
    mapping.x || columns[0] || 'x',
    ...mapping.y.filter((_, index) => yIndexes[index] !== undefined),
  ];

  const source = limitedRows.map(row => {
    const xValue = xIndex >= 0 ? cellToScalar(row[xIndex]) : cellToScalar(row[0]);
    const yValues = yIndexes.map(index => cellToScalar(row[index]));
    return [xValue, ...yValues];
  });

  return { dimensions, source };
}

export function mapDatabaseToDataset(
  table: DatabaseTableSnapshot,
  mapping: ChartMapping
): ChartDataset {
  const xColumn = resolveColumn(table.columns, mapping.x);
  const yColumns = mapping.y
    .map(key => resolveColumn(table.columns, key))
    .filter((column): column is { id: string; name: string } => !!column);

  const dimensions = [
    xColumn?.name ?? mapping.x ?? 'x',
    ...yColumns.map(column => column.name),
  ];

  const source = table.rows.map(row => {
    const xValue = xColumn
      ? cellToScalar(row.cells[xColumn.id] ?? row.cells[xColumn.name])
      : cellToScalar(row.title);
    const yValues = yColumns.map(column =>
      cellToScalar(row.cells[column.id] ?? row.cells[column.name])
    );
    return [xValue ?? row.title ?? row.id, ...yValues];
  });

  return { dimensions, source };
}

export function parseCsv(text: string): ChartInlineTable {
  const rows: Array<Array<string | number | null>> = [];
  let current = '';
  let row: Array<string | number | null> = [];
  let inQuotes = false;

  const pushCell = () => {
    const trimmed = current.trim();
    const numeric = asFiniteNumber(trimmed);
    row.push(numeric ?? (trimmed === '' ? null : trimmed));
    current = '';
  };

  const pushRow = () => {
    pushCell();
    if (row.some(cell => cell != null && cell !== '')) {
      rows.push(row);
    }
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      pushCell();
      continue;
    }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      pushRow();
      continue;
    }
    current += char;
  }
  if (current || row.length) pushRow();

  const [header, ...body] = rows;
  const columns = (header ?? []).map((cell, index) =>
    cell == null || cell === '' ? `col${index + 1}` : String(cell)
  );

  return {
    columns,
    rows: body.map(line => {
      const next = line.slice(0, columns.length);
      while (next.length < columns.length) next.push(null);
      return next;
    }),
  };
}

export function limitCells(
  columns: string[],
  rows: Array<Array<string | number | null>>
): Array<Array<string | number | null>> {
  if (!columns.length) return [];
  const maxRows = Math.max(0, Math.floor(INLINE_CELL_LIMIT / columns.length));
  return rows.slice(0, maxRows);
}

export function countCells(dataset: ChartDataset): number {
  return dataset.dimensions.length * dataset.source.length;
}
