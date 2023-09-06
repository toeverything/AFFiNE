import type { Workspace } from '@blocksuite/store';
import { useMemo, useState } from 'react';

interface PageSelect {
  [key: string]: boolean;
}

export const usePageSelection = (blocksuiteWorkspace: Workspace) => {
  const pageMeta = blocksuiteWorkspace.meta.pageMetas;
  const initializer = useMemo(() => {
    return pageMeta.reduce((result, meta) => {
      return {
        ...result,
        [meta.id]: false,
      };
    }, {});
  }, [pageMeta]);
  const [pageSelect, setPageSelect] = useState<PageSelect>(initializer);

  return useMemo(
    () => ({
      setSelect: (pageId: string, select: boolean) => {
        setPageSelect(prevSelect => ({ ...prevSelect, [pageId]: select }));
      },
      getSelect: (pageId: string) => {
        return pageSelect[pageId] ?? false;
      },
      getSelectedPageIds: () => {
        return Object.entries(pageSelect)
          .filter(([, isSelected]) => isSelected)
          .map(([id]) => id);
      },
      getSelectAll: () => {
        return Object.values(pageSelect).every(value => value);
      },
      onSelectedAll: () => {
        const allSelected = Object.values(pageSelect).every(value => value);
        const newSelect = Object.keys(pageSelect).reduce(
          (result, key) => ({
            ...result,
            [key]: allSelected ? false : true,
          }),
          {}
        );
        setPageSelect(newSelect);
      },
      inverseSelect: () => {
        const newSelect = Object.keys(pageSelect).reduce(
          (result, key) => ({
            ...result,
            [key]: !pageSelect[key],
          }),
          {}
        );
        setPageSelect(newSelect);
      },
    }),
    [pageSelect, setPageSelect]
  );
};
