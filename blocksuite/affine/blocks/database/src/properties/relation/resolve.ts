import type { DatabaseBlockModel } from '@blocksuite/affine-model';
import type { Store } from '@blocksuite/store';

import {
  getColumn,
  getDatabase,
  readStoredCell,
} from '../../utils/database-lookup.js';

/**
 * How many relation hops a derived value may follow before giving up. A
 * relation can point at a database that points back, so a cap keeps a cycle
 * from hanging the editor; callers also carry a visited set, which catches
 * the common case earlier.
 */
export const MAX_RELATION_DEPTH = 8;

export type RelationPropertyData = {
  targetDatabaseId: string;
};

export type ReverseRelationPropertyData = {
  sourceDatabaseId: string;
  sourcePropertyId: string;
};

export const RELATION_TYPE = 'relation';
export const REVERSE_RELATION_TYPE = 'relation-reverse';

/**
 * The rows a relation cell points at, plus the database they live in.
 * Handles both directions: a stored `relation` reads its own array, while a
 * `relation-reverse` scans the owning side for rows that point back here.
 */
export const resolveLinkedRows = (
  store: Store,
  db: DatabaseBlockModel,
  rowId: string,
  propertyId: string
): { target: DatabaseBlockModel; rowIds: string[] } | undefined => {
  const column = getColumn(db, propertyId);
  if (!column) return undefined;

  if (column.type === RELATION_TYPE) {
    const data = column.data as Partial<RelationPropertyData>;
    const target = getDatabase(store, data.targetDatabaseId);
    if (!target) return undefined;
    const stored = readStoredCell(db, rowId, propertyId);
    const ids = Array.isArray(stored) ? (stored as string[]) : [];
    // Drop ids whose row has since been deleted, so callers never have to.
    const live = new Set(target.children.map(row => row.id));
    return { target, rowIds: ids.filter(id => live.has(id)) };
  }

  if (column.type === REVERSE_RELATION_TYPE) {
    const data = column.data as Partial<ReverseRelationPropertyData>;
    const source = getDatabase(store, data.sourceDatabaseId);
    const sourcePropertyId = data.sourcePropertyId;
    if (!source || !sourcePropertyId) return undefined;
    const rowIds = source.children
      .filter(row => {
        const stored = readStoredCell(source, row.id, sourcePropertyId);
        return Array.isArray(stored) && stored.includes(rowId);
      })
      .map(row => row.id);
    return { target: source, rowIds };
  }

  return undefined;
};

/** Ids still stored on a relation cell that no longer resolve to a row. */
export const findOrphanIds = (
  store: Store,
  db: DatabaseBlockModel,
  rowId: string,
  propertyId: string
): string[] => {
  const column = getColumn(db, propertyId);
  if (!column || column.type !== RELATION_TYPE) return [];
  const target = getDatabase(
    store,
    (column.data as Partial<RelationPropertyData>).targetDatabaseId
  );
  const stored = readStoredCell(db, rowId, propertyId);
  const ids = Array.isArray(stored) ? (stored as string[]) : [];
  if (!target) return ids;
  const live = new Set(target.children.map(row => row.id));
  return ids.filter(id => !live.has(id));
};

/**
 * Adds the matching reverse property on the target database, so linking two
 * databases gives both sides at once instead of leaving the other half to be
 * wired by hand. Does nothing if that pairing already exists.
 */
export const ensureReverseProperty = (
  source: DatabaseBlockModel,
  sourcePropertyId: string,
  target: DatabaseBlockModel,
  addProperty: (
    target: DatabaseBlockModel,
    name: string,
    data: ReverseRelationPropertyData
  ) => void
): void => {
  const already = target.props.columns$.value.some(
    column =>
      column.type === REVERSE_RELATION_TYPE &&
      (column.data as Partial<ReverseRelationPropertyData>)
        ?.sourcePropertyId === sourcePropertyId
  );
  if (already) return;
  const name = source.props.title$.value.toString() || 'Related';
  addProperty(target, name, {
    sourceDatabaseId: source.id,
    sourcePropertyId,
  });
};
