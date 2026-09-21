import type { DatabaseBlockModel } from '@blocksuite/affine-model';
import type { Store } from '@blocksuite/store';

import { getCell } from './block-utils.js';

export const DATABASE_FLAVOUR = 'affine:database';

export const getDatabases = (store: Store): DatabaseBlockModel[] =>
  store.getModelsByFlavour(DATABASE_FLAVOUR) as DatabaseBlockModel[];

/** Databases are blocks, so `getBlock$` keeps this reactive. */
export const getDatabase = (
  store: Store,
  databaseId: string | undefined
): DatabaseBlockModel | undefined => {
  if (!databaseId) return undefined;
  const block = store.getBlock$(databaseId);
  if (!block || block.flavour !== DATABASE_FLAVOUR) return undefined;
  return block.model as DatabaseBlockModel;
};

export const findDatabaseContainingRow = (
  store: Store,
  rowId: string
): DatabaseBlockModel | undefined =>
  getDatabases(store).find(db => db.children.some(row => row.id === rowId));

export const getColumn = (db: DatabaseBlockModel, propertyId: string) =>
  db.props.columns$.value.find(column => column.id === propertyId);

/** The plain stored value of a cell, straight off the `cells$` signal. */
export const readStoredCell = (
  db: DatabaseBlockModel,
  rowId: string,
  propertyId: string
): unknown => getCell(db, rowId, propertyId)?.value;
