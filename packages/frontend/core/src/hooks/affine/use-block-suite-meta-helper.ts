import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { usePageMetaHelper } from '@affine/core/hooks/use-block-suite-page-meta';
import { useBlockSuiteWorkspaceHelper } from '@affine/core/hooks/use-block-suite-workspace-helper';
import { CollectionService } from '@affine/core/modules/collection';
import { PageRecordList, useService } from '@toeverything/infra';
import { useCallback } from 'react';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';

import type { BlockSuiteWorkspace } from '../../shared';
import { useNavigateHelper } from '../use-navigate-helper';
import { useReferenceLinkHelper } from './use-reference-link-helper';

export function useBlockSuiteMetaHelper(
  blockSuiteWorkspace: BlockSuiteWorkspace
) {
  const { setPageMeta, getPageMeta, setPageReadonly, setPageTitle } =
    usePageMetaHelper(blockSuiteWorkspace);
  const { addReferenceLink } = useReferenceLinkHelper(blockSuiteWorkspace);
  const { createPage } = useBlockSuiteWorkspaceHelper(blockSuiteWorkspace);
  const { openPage } = useNavigateHelper();
  const collectionService = useService(CollectionService);
  const pageRecordList = useService(PageRecordList);

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
    (pageId: string) => {
      setPageMeta(pageId, {
        trash: true,
        trashDate: Date.now(),
        trashRelate: undefined,
      });
      setPageReadonly(pageId, true);
      collectionService.deletePagesFromCollections([pageId]);
    },
    [collectionService, setPageMeta, setPageReadonly]
  );

  const restoreFromTrash = useCallback(
    (pageId: string) => {
      const { trashRelate } = getPageMeta(pageId) ?? {};

      if (trashRelate) {
        addReferenceLink(trashRelate, pageId);
      }

      setPageMeta(pageId, {
        trash: false,
        trashDate: undefined,
        trashRelate: undefined,
      });
      setPageReadonly(pageId, false);
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
    async (pageId: string, openPageAfterDuplication: boolean = true) => {
      const currentPageMode = pageRecordList.record(pageId).value?.mode.value;
      const currentPageMeta = getPageMeta(pageId);
      const newPage = createPage();
      const currentPage = blockSuiteWorkspace.getPage(pageId);

      newPage.waitForLoaded();
      if (!currentPageMeta || !currentPage) {
        return;
      }

      const update = encodeStateAsUpdate(currentPage.spaceDoc);
      applyUpdate(newPage.spaceDoc, update);

      setPageMeta(newPage.id, {
        tags: currentPageMeta.tags,
        favorite: currentPageMeta.favorite,
      });

      const lastDigitRegex = /\((\d+)\)$/;
      const match = currentPageMeta.title.match(lastDigitRegex);
      const newNumber = match ? parseInt(match[1], 10) + 1 : 1;

      const newPageTitle =
        currentPageMeta.title.replace(lastDigitRegex, '') + `(${newNumber})`;

      pageRecordList
        .record(newPage.id)
        .value?.setMode(currentPageMode || 'page');
      setPageTitle(newPage.id, newPageTitle);
      openPageAfterDuplication && openPage(blockSuiteWorkspace.id, newPage.id);
    },
    [
      blockSuiteWorkspace,
      createPage,
      getPageMeta,
      openPage,
      pageRecordList,
      setPageMeta,
      setPageTitle,
    ]
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

    duplicate,
  };
}
