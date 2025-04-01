import { getBlockUniqueId } from './block';
import { getDocUniqueId } from './doc';

export enum SearchTable {
  block = 'block',
  doc = 'doc',
}

export const SearchTableUniqueId = {
  [SearchTable.block]: getBlockUniqueId,
  [SearchTable.doc]: getDocUniqueId,
};

export * from './block';
export * from './doc';
