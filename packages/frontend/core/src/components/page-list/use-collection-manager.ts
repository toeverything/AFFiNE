import type { Collection, Filter, VariableMap } from '@affine/env/filter';
import type { DocMeta } from '@blocksuite/affine/store';

import { evalFilterList } from './filter';

export const createEmptyCollection = (
  id: string,
  data?: Partial<Omit<Collection, 'id'>>
): Collection => {
  return {
    id,
    name: '',
    filterList: [],
    allowList: [],
    ...data,
  };
};

export const filterByFilterList = (filterList: Filter[], varMap: VariableMap) =>
  evalFilterList(filterList, varMap);

export type PageDataForFilter = {
  meta: DocMeta;
  favorite: boolean;
  publicMode: undefined | 'page' | 'edgeless';
};

export const filterPage = (collection: Collection, page: PageDataForFilter) => {
  if (collection.filterList.length === 0) {
    return collection.allowList.includes(page.meta.id);
  }
  return filterPageByRules(collection.filterList, collection.allowList, page);
};
export const filterPageByRules = (
  rules: Filter[],
  allowList: string[],
  { meta, publicMode, favorite }: PageDataForFilter
) => {
  if (allowList?.includes(meta.id)) {
    return true;
  }
  return filterByFilterList(rules, {
    'Is Favourited': !!favorite,
    'Is Public': !!publicMode,
    Created: meta.createDate,
    Updated: meta.updatedDate ?? meta.createDate,
    Tags: meta.tags,
  });
};
