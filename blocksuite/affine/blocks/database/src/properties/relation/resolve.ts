import type { DatabaseBlockModel } from '@blocksuite/affine-model';
import type { Store } from '@blocksuite/store';

import { deleteColumn } from '../../utils/block-utils.js';
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
    // Only answer while the pairing still holds. If the owning relation was
    // deleted or now points somewhere else, the ids it stores are not rows of
    // this database, and listing them would show links that no longer exist.
    const sourceColumn = getColumn(source, sourcePropertyId);
    if (
      sourceColumn?.type !== RELATION_TYPE ||
      (sourceColumn.data as Partial<RelationPropertyData>).targetDatabaseId !==
        db.id
    ) {
      return undefined;
    }
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

const isReverseOf = (
  column: { type: string; data: unknown },
  source: DatabaseBlockModel,
  sourcePropertyId: string
) => {
  if (column.type !== REVERSE_RELATION_TYPE) return false;
  const data = column.data as Partial<ReverseRelationPropertyData>;
  return (
    data?.sourcePropertyId === sourcePropertyId &&
    data.sourceDatabaseId === source.id
  );
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
  const already = target.props.columns$.value.some(column =>
    isReverseOf(column, source, sourcePropertyId)
  );
  if (already) return;
  const name = source.props.title$.value.toString() || 'Related';
  addProperty(target, name, {
    sourceDatabaseId: source.id,
    sourcePropertyId,
  });
};

/**
 * Removes the reverse property a relation left on a database it no longer
 * points at. Without this, retargeting a relation leaves the old database
 * with a column for a pairing that is gone.
 */
export const removeReverseProperty = (
  source: DatabaseBlockModel,
  sourcePropertyId: string,
  target: DatabaseBlockModel
): void => {
  target.props.columns$.value
    .filter(column => isReverseOf(column, source, sourcePropertyId))
    .forEach(column => deleteColumn(target, column.id));
};
