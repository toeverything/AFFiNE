import {
  filterPage,
  filterPageByRules,
  useCollectionManager,
} from '@affine/component/page-list';
import type { PageMeta } from '@blocksuite/store';
import { useAtomValue } from 'jotai';
import { useMemo } from 'react';

import { allPageModeSelectAtom } from '../../atoms';
import { collectionsCRUDAtom } from '../../atoms/collections';
import { usePageHelper } from '../../components/blocksuite/block-suite-page-list/utils';
import type { BlockSuiteWorkspace } from '../../shared';

export const useFilteredPageMetas = (
  route: 'all' | 'trash',
  pageMetas: PageMeta[],
  workspace: BlockSuiteWorkspace
) => {
  const { isPreferredEdgeless } = usePageHelper(workspace);
  const pageMode = useAtomValue(allPageModeSelectAtom);
  const { currentCollection, isDefault } =
    useCollectionManager(collectionsCRUDAtom);

  const filteredPageMetas = useMemo(
    () =>
      pageMetas
        .filter(pageMeta => {
          if (pageMode === 'all') {
            return true;
          }
          if (pageMode === 'edgeless') {
            return isPreferredEdgeless(pageMeta.id);
          }
          if (pageMode === 'page') {
            return !isPreferredEdgeless(pageMeta.id);
          }
          console.error('unknown filter mode', pageMeta, pageMode);
          return true;
        })
        .filter(pageMeta => {
          if (
            (route === 'trash' && !pageMeta.trash) ||
            (route === 'all' && pageMeta.trash)
          ) {
            return false;
          }
          if (!currentCollection) {
            return true;
          }
          return isDefault
            ? filterPageByRules(
                currentCollection.filterList,
                currentCollection.allowList,
                pageMeta
              )
            : filterPage(currentCollection, pageMeta);
        }),
    [
      currentCollection,
      isDefault,
      isPreferredEdgeless,
      pageMetas,
      pageMode,
      route,
    ]
  );

  return filteredPageMetas;
};
