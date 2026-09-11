import type { DatabaseRowSnapshot } from './types';

/**
 * Subset of the `@blocksuite/data-view` filter model (`core/filter/types.ts`).
 * The chart cannot instantiate a `DataViewManager`, so it evaluates the stored
 * filter tree directly. Semantics mirror `core/filter/filter-fn/*`.
 */
export type FilterRef = { type: 'ref'; name: string };

export type FilterLiteral = { type: 'literal'; value: unknown };

export type SingleFilter = {
  type: 'filter';
  left: FilterRef;
  function?: string;
  args: FilterLiteral[];
};

export type FilterGroup = {
  type: 'group';
  op: 'and' | 'or';
  conditions: ViewFilter[];
};

export type ViewFilter = SingleFilter | FilterGroup;

export type DatabaseViewSnapshot = {
  id: string;
  name: string;
  mode: string;
  filter?: FilterGroup;
  /** Column ids hidden in this view; hidden columns are not chartable. */
  hiddenColumnIds: string[];
  /** Column order as configured in the view. */
  columnOrder: string[];
};

function text(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(text).join(', ');
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('value' in record) return text(record.value);
    if ('text' in record) return text(record.text);
  }
  return '';
}

function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function tags(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const single = text(value);
  return single ? [single] : [];
}

/**
 * Returns `null` for filter functions this evaluator does not model, so the
 * caller can keep the row rather than silently dropping data.
 */
function evaluateSingle(filter: SingleFilter, cell: unknown): boolean | null {
  const arg = filter.args[0]?.value;

  switch (filter.function) {
    case 'is':
      return text(cell).toLowerCase() === text(arg).toLowerCase();
    case 'isNot':
      return text(cell).toLowerCase() !== text(arg).toLowerCase();
    case 'contains':
      return text(cell).toLowerCase().includes(text(arg).toLowerCase());
    case 'doesNoContains':
      return !text(cell).toLowerCase().includes(text(arg).toLowerCase());
    case 'startsWith':
      return text(cell).toLowerCase().startsWith(text(arg).toLowerCase());
    case 'endsWith':
      return text(cell).toLowerCase().endsWith(text(arg).toLowerCase());
    case 'isChecked':
      return cell === true;
    case 'isUnchecked':
      return cell !== true;
    case 'isEmpty':
      return text(cell) === '';
    case 'isNotEmpty':
      return text(cell) !== '';
    case 'isOneOf': {
      const wanted = tags(arg).map(item => item.toLowerCase());
      if (!wanted.length) return true;
      return tags(cell).some(item => wanted.includes(item.toLowerCase()));
    }
    case 'isNotOneOf': {
      const wanted = tags(arg).map(item => item.toLowerCase());
      if (!wanted.length) return true;
      return !tags(cell).some(item => wanted.includes(item.toLowerCase()));
    }
    default:
      break;
  }

  const left = num(cell);
  const right = num(arg);
  if (left == null || right == null) return null;
  switch (filter.function) {
    case 'equal':
      return left === right;
    case 'notEqual':
      return left !== right;
    case 'greatThan':
      return left > right;
    case 'lessThan':
      return left < right;
    case 'greatThanOrEqual':
      return left >= right;
    case 'lessThanOrEqual':
      return left <= right;
    default:
      return null;
  }
}

function evaluate(filter: ViewFilter, row: DatabaseRowSnapshot): boolean {
  if (filter.type === 'group') {
    const results = filter.conditions.map(child => evaluate(child, row));
    if (!results.length) return true;
    return filter.op === 'or' ? results.some(Boolean) : results.every(Boolean);
  }
  const cell = row.cells[filter.left.name];
  const result = evaluateSingle(filter, cell);
  // Unsupported predicate: keep the row instead of dropping data silently.
  return result ?? true;
}

export function filterRowsByView(
  rows: DatabaseRowSnapshot[],
  view: DatabaseViewSnapshot | undefined
): DatabaseRowSnapshot[] {
  if (!view?.filter || !view.filter.conditions.length) return rows;
  return rows.filter(row => evaluate(view.filter as FilterGroup, row));
}

export function isColumnVisibleInView(
  columnId: string,
  view: DatabaseViewSnapshot | undefined
): boolean {
  if (!view) return true;
  return !view.hiddenColumnIds.includes(columnId);
}
