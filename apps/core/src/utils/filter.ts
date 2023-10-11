import { filterByFilterList } from '@affine/component/page-list';
import type { Collection } from '@affine/env/filter';
import type { PageMeta } from '@blocksuite/store';

export const filterPage = (collection: Collection, page: PageMeta) => {
  if (collection.mode === 'page') {
    return collection.pages.includes(page.id);
  }
  if (collection.allowList?.includes(page.id)) {
    return true;
  }
  return filterByFilterList(collection.filterList, {
    'Is Favourited': !!page.favorite,
    Created: page.createDate,
    Updated: page.updatedDate ?? page.createDate,
    Tags: page.tags,
  });
};
