import {
  useBlockSuitePageMeta,
  usePageMetaHelper,
} from '@toeverything/hooks/use-block-suite-page-meta';
import { useCallback } from 'react';

import type { BlockSuiteWorkspace } from '../../shared';
import { useReferenceLinkHelper } from './use-reference-link-helper';

export function useBlockSuiteMetaHelper(
  blockSuiteWorkspace: BlockSuiteWorkspace
) {
  const { setPageMeta, getPageMeta } = usePageMetaHelper(blockSuiteWorkspace);
  const { addReferenceLink, removeReferenceLink } =
    useReferenceLinkHelper(blockSuiteWorkspace);
  const metas = useBlockSuitePageMeta(blockSuiteWorkspace);

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
        removeReferenceLink(pageId);
      }
    },
    [getPageMeta, metas, removeReferenceLink, setPageMeta]
  );

  const restoreFromTrash = useCallback(
    (pageId: string) => {
      const { subpageIds = [], trashRelate } = getPageMeta(pageId) ?? {};

      if (trashRelate) {
        addReferenceLink(trashRelate, pageId);
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
    [addReferenceLink, getPageMeta, setPageMeta]
  );

  return {
    removeToTrash,
    restoreFromTrash,
  };
}
