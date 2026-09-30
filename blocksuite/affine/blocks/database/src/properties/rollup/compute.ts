import type { DatabaseBlockModel } from '@blocksuite/affine-model';
import type { Store } from '@blocksuite/store';

import { getCell } from '../../utils/block-utils.js';
import { getColumn } from '../../utils/database-lookup.js';
import {
  MAX_RELATION_DEPTH,
  resolveLinkedRows,
  REVERSE_RELATION_TYPE,
} from '../relation/resolve.js';

/**
 * The property type string. Kept here rather than in `define.ts` so that
 * `relation-filter`, which walks through rollups, can recognise one without
 * pulling in the renderer and its lit dependencies.
 */
export const ROLLUP_TYPE = 'rollup';

export const ROLLUP_CALCS = [
  'count',
  'countChecked',
  'percentChecked',
  'sum',
  'avg',
  'min',
  'max',
] as const;

export type RollupCalc = (typeof ROLLUP_CALCS)[number];

export type RollupDisplay = 'number' | 'bar';

export type RollupPropertyData = {
  /** How the value reads in the cell: a plain number, or a filled bar. */
  display: RollupDisplay;
  /** The relation (or reverse relation) property on this row to walk. */
  relationPropertyId: string;
  /** The property to read on each linked row. Ignored by `count`. */
  targetPropertyId: string;
  calc: RollupCalc;
};

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return undefined;
};

const isChecked = (value: unknown): boolean =>
  value === true || value === 1 || value === '1';

/**
 * Reads one property of one row, resolving it first if it is itself computed.
 * This is what makes a rollup of a rollup work: the inner one is evaluated
 * here, one level deeper, exactly as the outer one was.
 */
const readValue = (
  store: Store,
  db: DatabaseBlockModel,
  rowId: string,
  propertyId: string,
  depth: number,
  seen: Set<string>
): unknown => {
  const column = getColumn(db, propertyId);
  if (!column) return undefined;
  if (column.type === ROLLUP_TYPE) {
    return computeRollup(store, db, rowId, propertyId, depth, seen);
  }
  if (column.type === REVERSE_RELATION_TYPE) {
    return resolveLinkedRows(store, db, rowId, propertyId)?.rowIds ?? [];
  }
  return getCell(db, rowId, propertyId)?.value;
};

export const computeRollup = (
  store: Store,
  db: DatabaseBlockModel,
  rowId: string,
  propertyId: string,
  depth = 0,
  seen: Set<string> = new Set()
): number | undefined => {
  if (depth > MAX_RELATION_DEPTH) return undefined;
  // A rollup that reaches itself would otherwise recurse until the cap; bail
  // at the first repeat so a cycle costs one pass, not eight.
  const key = `${db.id}:${rowId}:${propertyId}`;
  if (seen.has(key)) return undefined;
  const nextSeen = new Set(seen).add(key);

  const column = getColumn(db, propertyId);
  if (!column) return undefined;
  const { relationPropertyId, targetPropertyId, calc } =
    column.data as Partial<RollupPropertyData>;
  if (!relationPropertyId || !calc) return undefined;

  const linked = resolveLinkedRows(store, db, rowId, relationPropertyId);
  if (!linked) return undefined;
  const { target, rowIds } = linked;

  if (calc === 'count') return rowIds.length;

  if (!targetPropertyId) return undefined;
  const values = rowIds.map(id =>
    readValue(store, target, id, targetPropertyId, depth + 1, nextSeen)
  );

  if (calc === 'countChecked') return values.filter(isChecked).length;
  if (calc === 'percentChecked') {
    if (values.length === 0) return 0;
    return Math.round((values.filter(isChecked).length / values.length) * 100);
  }

  const numbers = values
    .map(toNumber)
    .filter((n): n is number => n !== undefined);
  if (numbers.length === 0) return calc === 'sum' ? 0 : undefined;
  if (calc === 'sum') return numbers.reduce((a, b) => a + b, 0);
  if (calc === 'avg') {
    const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    return Math.round(mean * 100) / 100;
  }
  if (calc === 'min') return Math.min(...numbers);
  return Math.max(...numbers);
};
