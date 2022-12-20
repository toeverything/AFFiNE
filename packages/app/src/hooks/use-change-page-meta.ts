import { useCallback } from 'react';
import { useAppState } from '@/providers/app-state-provider';
import { PageMeta } from '@blocksuite/store';

export type ChangePageMeta = (
  pageId: string,
  pageMeta: Partial<PageMeta>
) => void;

export const useChangePageMeta = () => {
  const { currentWorkspace } = useAppState();

  return useCallback<ChangePageMeta>(
    (pageId, pageMeta) => {
      currentWorkspace?.setPageMeta(pageId, {
        ...pageMeta,
      });
    },
    [currentWorkspace]
  );
};

export default ChangePageMeta;
