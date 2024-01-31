import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import {
  useBlockSuitePageMeta,
  usePageMetaHelper,
} from '@affine/core/hooks/use-block-suite-page-meta';
import { useBlockSuiteWorkspaceHelper } from '@affine/core/hooks/use-block-suite-workspace-helper';
import { CollectionService } from '@affine/core/modules/collection';
import { useService } from '@toeverything/infra';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';

import { setPageModeAtom } from '../../atoms';
import { currentModeAtom } from '../../atoms/mode';
import type { BlockSuiteWorkspace } from '../../shared';
import { useNavigateHelper } from '../use-navigate-helper';
import { useReferenceLinkHelper } from './use-reference-link-helper';

export function useBlockSuiteMetaHelper(
  blockSuiteWorkspace: BlockSuiteWorkspace
) {
  const { setPageMeta, getPageMeta, setPageReadonly, setPageTitle } =
    usePageMetaHelper(blockSuiteWorkspace);
  const { addReferenceLink } = useReferenceLinkHelper(blockSuiteWorkspace);
  const metas = useBlockSuitePageMeta(blockSuiteWorkspace);
  const setPageMode = useSetAtom(setPageModeAtom);
  const currentMode = useAtomValue(currentModeAtom);
  const { createPage } = useBlockSuiteWorkspaceHelper(blockSuiteWorkspace);
  const { openPage } = useNavigateHelper();
  const collectionService = useService(CollectionService);

  const switchToPageMode = useCallback(
    (pageId: string) => {
      setPageMode(pageId, 'page');
    },
    [setPageMode]
  );
  const switchToEdgelessMode = useCallback(
    (pageId: string) => {
      setPageMode(pageId, 'edgeless');
    },
    [setPageMode]
  );
  const togglePageMode = useCallback(
    (pageId: string) => {
      setPageMode(pageId, currentMode === 'edgeless' ? 'page' : 'edgeless');
    },
    [currentMode, setPageMode]
  );

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
        trashDate: Date.now(),
        trashRelate: isRoot ? parentMeta?.id : undefined,
      });
      setPageReadonly(pageId, true);
      collectionService.deletePagesFromCollections([pageId]);
    },
    [collectionService, getPageMeta, metas, setPageMeta, setPageReadonly]
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
      setPageReadonly(pageId, false);
      subpageIds.forEach(id => {
        restoreFromTrash(id);
      });
    },
    [addReferenceLink, getPageMeta, setPageMeta, setPageReadonly]
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

  const duplicate = useAsyncCallback(
    async (pageId: string) => {
      const currentPageMeta = getPageMeta(pageId);
      const newPage = createPage();
      const currentPage = blockSuiteWorkspace.getPage(pageId);

      await newPage.waitForLoaded();
      if (!currentPageMeta || !currentPage) {
        return;
      }

      const update = encodeStateAsUpdate(currentPage.spaceDoc);
      applyUpdate(newPage.spaceDoc, update);

      setPageMeta(newPage.id, {
        tags: currentPageMeta.tags,
        favorite: currentPageMeta.favorite,
      });
      setPageMode(newPage.id, currentMode);
      setPageTitle(newPage.id, `${currentPageMeta.title}(1)`);
      openPage(blockSuiteWorkspace.id, newPage.id);
    },
    [
      blockSuiteWorkspace,
      createPage,
      currentMode,
      getPageMeta,
      openPage,
      setPageMeta,
      setPageMode,
      setPageTitle,
    ]
  );

  return {
    switchToPageMode,
    switchToEdgelessMode,
    togglePageMode,

    publicPage,
    cancelPublicPage,

    addToFavorite,
    removeFromFavorite,
    toggleFavorite,

    removeToTrash,
    restoreFromTrash,
    permanentlyDeletePage,

    duplicate,
  };
}
