import type { DatabaseBlockModel } from '@blocksuite/affine-model';
import type { Store } from '@blocksuite/store';

import { getCell } from '../../utils/block-utils.js';
import { getColumn } from '../../utils/database-lookup.js';
import {
  MAX_RELATION_DEPTH,
  resolveLinkedRows,
  REVERSE_RELATION_TYPE,
} from '../relation/resolve.js';
import { computeRollup, ROLLUP_TYPE } from '../rollup/compute.js';
import type { RelationFilterPropertyData } from './define.js';

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return undefined;
};

const isEmptyValue = (value: unknown): boolean =>
  value == null ||
  value === '' ||
  value === false ||
  (Array.isArray(value) && value.length === 0);

/**
 * Reads a property of a linked row, resolving it first when it is derived.
 * A filter may therefore test a rollup -- "goals that reached 100%".
 */
const readValue = (
  store: Store,
  db: DatabaseBlockModel,
  rowId: string,
  propertyId: string,
  depth: number
): unknown => {
  const column = getColumn(db, propertyId);
  if (!column) return undefined;
  if (column.type === ROLLUP_TYPE) {
    return computeRollup(store, db, rowId, propertyId, depth);
  }
  if (column.type === REVERSE_RELATION_TYPE) {
    return resolveLinkedRows(store, db, rowId, propertyId)?.rowIds ?? [];
  }
  return getCell(db, rowId, propertyId)?.value;
};

export const computeRelationFilter = (
  store: Store,
  db: DatabaseBlockModel,
  rowId: string,
  propertyId: string,
  depth = 0
): string[] => {
  if (depth > MAX_RELATION_DEPTH) return [];
  const column = getColumn(db, propertyId);
  if (!column) return [];
  const { relationPropertyId, targetPropertyId, condition, threshold } =
    column.data as Partial<RelationFilterPropertyData>;
  if (!relationPropertyId || !condition) return [];

  const linked = resolveLinkedRows(store, db, rowId, relationPropertyId);
  if (!linked) return [];
  const { target, rowIds } = linked;
  if (!targetPropertyId) return rowIds;

  return rowIds.filter(id => {
    const value = readValue(store, target, id, targetPropertyId, depth + 1);
    switch (condition) {
      case 'checked':
        return value === true || value === 1;
      case 'unchecked':
        return !(value === true || value === 1);
      case 'notEmpty':
        return !isEmptyValue(value);
      case 'empty':
        return isEmptyValue(value);
      case 'gte': {
        const n = toNumber(value);
        return n !== undefined && n >= (threshold ?? 0);
      }
      case 'lt': {
        const n = toNumber(value);
        return n !== undefined && n < (threshold ?? 0);
      }
      default:
        return true;
    }
  });
};
