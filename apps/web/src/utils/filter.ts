import { filterByFilterList } from '@affine/component/page-list';
import type { View } from '@affine/env/filter';
import type { PageMeta } from '@blocksuite/store';

export const filterPage = (view: View, page: PageMeta) => {
  if (view.whiteList?.includes(page.id)) {
    return true;
  }
  return filterByFilterList(view.filterList, {
    'Is Favourited': !!page.favorite,
    Created: page.createDate,
    Updated: page.updatedDate ?? page.createDate,
  });
};
