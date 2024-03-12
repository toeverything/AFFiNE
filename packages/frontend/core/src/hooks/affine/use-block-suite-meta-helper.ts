import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useDocMetaHelper } from '@affine/core/hooks/use-block-suite-page-meta';
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
  const { setDocMeta, getDocMeta, setDocReadonly, setDocTitle } =
    useDocMetaHelper(blockSuiteWorkspace);
  const { addReferenceLink } = useReferenceLinkHelper(blockSuiteWorkspace);
  const { createDoc } = useBlockSuiteWorkspaceHelper(blockSuiteWorkspace);
  const { openPage } = useNavigateHelper();
  const collectionService = useService(CollectionService);
  const pageRecordList = useService(PageRecordList);

  const addToFavorite = useCallback(
    (pageId: string) => {
      setDocMeta(pageId, {
        favorite: true,
      });
    },
    [setDocMeta]
  );
  const removeFromFavorite = useCallback(
    (pageId: string) => {
      setDocMeta(pageId, {
        favorite: false,
      });
    },
    [setDocMeta]
  );
  const toggleFavorite = useCallback(
    (pageId: string) => {
      const { favorite } = getDocMeta(pageId) ?? {};
      setDocMeta(pageId, {
        favorite: !favorite,
      });
    },
    [getDocMeta, setDocMeta]
  );

  // TODO-Doma
  // "Remove" may cause ambiguity here. Consider renaming as "moveToTrash".
  const removeToTrash = useCallback(
    (pageId: string) => {
      setDocMeta(pageId, {
        trash: true,
        trashDate: Date.now(),
        trashRelate: undefined,
      });
      setDocReadonly(pageId, true);
      collectionService.deletePagesFromCollections([pageId]);
    },
    [collectionService, setDocMeta, setDocReadonly]
  );

  const restoreFromTrash = useCallback(
    (pageId: string) => {
      const { trashRelate } = getDocMeta(pageId) ?? {};

      if (trashRelate) {
        addReferenceLink(trashRelate, pageId);
      }

      setDocMeta(pageId, {
        trash: false,
        trashDate: undefined,
        trashRelate: undefined,
      });
      setDocReadonly(pageId, false);
    },
    [addReferenceLink, getDocMeta, setDocMeta, setDocReadonly]
  );

  const permanentlyDeletePage = useCallback(
    (pageId: string) => {
      blockSuiteWorkspace.removeDoc(pageId);
    },
    [blockSuiteWorkspace]
  );

  /**
   * see {@link useBlockSuiteWorkspacePageIsPublic}
   */
  const publicPage = useCallback(
    (pageId: string) => {
      setDocMeta(pageId, {
        isPublic: true,
      });
    },
    [setDocMeta]
  );

  /**
   * see {@link useBlockSuiteWorkspacePageIsPublic}
   */
  const cancelPublicPage = useCallback(
    (pageId: string) => {
      setDocMeta(pageId, {
        isPublic: false,
      });
    },
    [setDocMeta]
  );

  const duplicate = useAsyncCallback(
    async (pageId: string, openPageAfterDuplication: boolean = true) => {
      const currentPageMode = pageRecordList.record(pageId).value?.mode.value;
      const currentPageMeta = getDocMeta(pageId);
      const newPage = createDoc();
      const currentPage = blockSuiteWorkspace.getDoc(pageId);

      newPage.load();
      if (!currentPageMeta || !currentPage) {
        return;
      }

      const update = encodeStateAsUpdate(currentPage.spaceDoc);
      applyUpdate(newPage.spaceDoc, update);

      setDocMeta(newPage.id, {
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
      setDocTitle(newPage.id, newPageTitle);
      openPageAfterDuplication && openPage(blockSuiteWorkspace.id, newPage.id);
    },
    [
      blockSuiteWorkspace,
      createDoc,
      getDocMeta,
      openPage,
      pageRecordList,
      setDocMeta,
      setDocTitle,
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
