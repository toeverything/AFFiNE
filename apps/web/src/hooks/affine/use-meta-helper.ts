import { useCallback } from 'react';

import type { BlockSuiteWorkspace } from '../../shared';
import { usePageMeta, usePageMetaHelper } from '../use-page-meta';

export function useMetaHelper(blockSuiteWorkspace: BlockSuiteWorkspace | null) {
  const { setPageMeta, getPageMeta } = usePageMetaHelper(blockSuiteWorkspace);
  const metas = usePageMeta(blockSuiteWorkspace);

  const removeToTrash = useCallback(
    (pageId: string, isRoot = true) => {
      const parentMeta = metas.find(m => m.subpageIds?.includes(pageId));
      const { subpageIds = [] } = getPageMeta(pageId) ?? {};

      subpageIds.forEach(id => {
        removeToTrash(id, false);
      });

      setPageMeta(pageId, {
        trash: true,
        trashDate: +new Date(),
        trashRelate: isRoot ? parentMeta?.id : undefined,
      });

      // Just the trash root need delete its id from parent
      if (parentMeta && isRoot) {
        const deleteIndex = parentMeta.subpageIds.findIndex(
          id => id === pageId
        );
        const newSubpageIds = [...parentMeta.subpageIds];
        newSubpageIds.splice(deleteIndex, 1);
        setPageMeta(parentMeta.id, {
          subpageIds: newSubpageIds,
        });
      }
    },
    [getPageMeta, metas, setPageMeta]
  );

  const restoreFromTrash = useCallback(
    (pageId: string) => {
      const { subpageIds = [], trashRelate } = getPageMeta(pageId) ?? {};

      if (trashRelate) {
        const parentMeta = metas.find(m => m.id === trashRelate);
        parentMeta &&
          setPageMeta(parentMeta.id, {
            subpageIds: [...parentMeta.subpageIds, pageId],
          });
      }

      setPageMeta(pageId, {
        trash: false,
        trashDate: undefined,
        trashRelate: undefined,
      });
      subpageIds.forEach(id => {
        restoreFromTrash(id);
      });
    },
    [getPageMeta, metas, setPageMeta]
  );

  return {
    removeToTrash,
    restoreFromTrash,
  };
}
