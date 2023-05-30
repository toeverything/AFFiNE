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

  const addToFavorite = useCallback(
    (pageId: string) => {
      setPageMeta(pageId, {
        favorite: true,
      });
    },
    [setPageMeta]
  );
  const removeFromFavorite = useCallback(
    (pageId: string) => {
      setPageMeta(pageId, {
        favorite: false,
      });
    },
    [setPageMeta]
  );
  const toggleFavorite = useCallback(
    (pageId: string) => {
      const { favorite } = getPageMeta(pageId) ?? {};
      setPageMeta(pageId, {
        favorite: !favorite,
      });
    },
    [getPageMeta, setPageMeta]
  );

  // TODO-Doma
  // "Remove" may cause ambiguity here. Consider renaming as "moveToTrash".
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

  const permanentlyDeletePage = useCallback(
    (pageId: string) => {
      blockSuiteWorkspace.removePage(pageId);
    },
    [blockSuiteWorkspace]
  );

  /**
   * see {@link useBlockSuiteWorkspacePageIsPublic}
   */
  const publicPage = useCallback(
    (pageId: string) => {
      setPageMeta(pageId, {
        isPublic: true,
      });
    },
    [setPageMeta]
  );

  /**
   * see {@link useBlockSuiteWorkspacePageIsPublic}
   */
  const cancelPublicPage = useCallback(
    (pageId: string) => {
      setPageMeta(pageId, {
        isPublic: false,
      });
    },
    [setPageMeta]
  );

  return {
    publicPage,
    cancelPublicPage,

    addToFavorite,
    removeFromFavorite,
    toggleFavorite,

    removeToTrash,
    restoreFromTrash,
    permanentlyDeletePage,
  };
}
