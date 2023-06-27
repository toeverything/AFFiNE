import { filterByFilterList } from '@affine/component/page-list';
import type { Filter } from '@affine/env/filter';
import type { PageMeta } from '@blocksuite/store';

export const filterPage = (filterList: Filter[], page: PageMeta) => {
  return filterByFilterList(filterList, {
    'Is Favourited': !!page.favorite,
    Created: page.createDate,
    Updated: page.updatedDate ?? page.createDate,
  });
};
