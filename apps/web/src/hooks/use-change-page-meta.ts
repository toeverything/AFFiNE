import { PageMeta } from '@affine/store';
import { useCallback } from 'react';

import { useGlobalState } from '@/store/app';

export type ChangePageMeta = (
  pageId: string,
  pageMeta: Partial<PageMeta>
) => void;

export const useChangePageMeta = () => {
  const currentWorkspace = useGlobalState(
    useCallback(store => store.currentDataCenterWorkspace, [])
  );

  return useCallback<ChangePageMeta>(
    (pageId, pageMeta) => {
      currentWorkspace?.blocksuiteWorkspace?.setPageMeta(pageId, {
        ...pageMeta,
      });
    },
    [currentWorkspace]
  );
};

export default ChangePageMeta;
