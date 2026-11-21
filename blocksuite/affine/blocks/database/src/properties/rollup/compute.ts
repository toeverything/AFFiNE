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
 * State shared by one top-level evaluation. Only finished results that did
 * not depend on how they were reached are memoised: a value cut short by the
 * visited set or the depth cap is specific to its path, so caching it would
 * hand a truncated answer to a path that could have finished.
 *
 * A row that finished without being cut short cannot reach any of its own
 * ancestors (that would be a cycle, and the visited set would have cut it), so
 * its value is the same from every path and the cached copy is exact.
 */
type Walk = {
  memo: Map<string, number | undefined>;
};

type Evaluated = {
  value: number | undefined;
  /** True when a cycle or the depth cap cut the walk short below here. */
  cut: boolean;
};

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
  seen: Set<string>,
  walk: Walk
): { value: unknown; cut: boolean } => {
  const column = getColumn(db, propertyId);
  if (!column) return { value: undefined, cut: false };
  if (column.type === ROLLUP_TYPE) {
    return evaluate(store, db, rowId, propertyId, depth, seen, walk);
  }
  if (column.type === REVERSE_RELATION_TYPE) {
    return {
      value: resolveLinkedRows(store, db, rowId, propertyId)?.rowIds ?? [],
      cut: false,
    };
  }
  return { value: getCell(db, rowId, propertyId)?.value, cut: false };
};

const evaluate = (
  store: Store,
  db: DatabaseBlockModel,
  rowId: string,
  propertyId: string,
  depth: number,
  seen: Set<string>,
  walk: Walk
): Evaluated => {
  if (depth > MAX_RELATION_DEPTH) return { value: undefined, cut: true };
  // A rollup that reaches itself would otherwise recurse until the cap; bail
  // at the first repeat so a cycle costs one pass, not eight.
  const key = `${db.id}:${rowId}:${propertyId}`;
  if (seen.has(key)) return { value: undefined, cut: true };
  // Rows reached along several paths -- a task shared by two projects in the
  // same team -- are worked out once per walk instead of once per path.
  if (walk.memo.has(key)) return { value: walk.memo.get(key), cut: false };
  const nextSeen = new Set(seen).add(key);

  const column = getColumn(db, propertyId);
  if (!column) return { value: undefined, cut: false };
  const { relationPropertyId, targetPropertyId, calc } =
    column.data as Partial<RollupPropertyData>;
  if (!relationPropertyId || !calc) return { value: undefined, cut: false };

  const linked = resolveLinkedRows(store, db, rowId, relationPropertyId);
  let result: Evaluated;
  if (!linked) {
    result = { value: undefined, cut: false };
  } else if (calc === 'count') {
    result = { value: linked.rowIds.length, cut: false };
  } else if (!targetPropertyId) {
    result = { value: undefined, cut: false };
  } else {
    let cut = false;
    const values = linked.rowIds.map(id => {
      const read = readValue(
        store,
        linked.target,
        id,
        targetPropertyId,
        depth + 1,
        nextSeen,
        walk
      );
      cut ||= read.cut;
      return read.value;
    });
    result = { value: aggregate(calc, values), cut };
  }
  if (!result.cut) walk.memo.set(key, result.value);
  return result;
};

const aggregate = (calc: RollupCalc, values: unknown[]): number | undefined => {
  if (calc === 'count') return values.length;
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

/**
 * A fresh walk per call, so each read sees current data; pass `walk` to share
 * the memo across several reads that happen together, as a relation filter
 * testing many rows does.
 */
export const createRollupWalk = (): Walk => ({ memo: new Map() });

export const computeRollup = (
  store: Store,
  db: DatabaseBlockModel,
  rowId: string,
  propertyId: string,
  depth = 0,
  walk: Walk = createRollupWalk()
): number | undefined =>
  evaluate(store, db, rowId, propertyId, depth, new Set(), walk).value;
