import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { useDocMetaHelper } from '@affine/core/components/hooks/use-block-suite-page-meta';
import { useDocCollectionHelper } from '@affine/core/components/hooks/use-block-suite-workspace-helper';
import type { DocMode } from '@blocksuite/affine/blocks';
import { DocsService, useService, WorkspaceService } from '@toeverything/infra';
import { useCallback } from 'react';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';

import { useNavigateHelper } from '../use-navigate-helper';

export function useBlockSuiteMetaHelper() {
  const workspace = useService(WorkspaceService).workspace;
  const { setDocMeta, getDocMeta, setDocTitle, setDocReadonly } =
    useDocMetaHelper();
  const { createDoc } = useDocCollectionHelper(workspace.docCollection);
  const { openPage } = useNavigateHelper();
  const docRecordList = useService(DocsService).list;

  // TODO-Doma
  // "Remove" may cause ambiguity here. Consider renaming as "moveToTrash".
  const removeToTrash = useCallback(
    (docId: string) => {
      const docRecord = docRecordList.doc$(docId).value;
      if (docRecord) {
        docRecord.moveToTrash();
        setDocReadonly(docId, true);
      }
    },
    [docRecordList, setDocReadonly]
  );

  const restoreFromTrash = useCallback(
    (docId: string) => {
      const docRecord = docRecordList.doc$(docId).value;
      if (docRecord) {
        docRecord.restoreFromTrash();
        setDocReadonly(docId, false);
      }
    },
    [docRecordList, setDocReadonly]
  );

  const permanentlyDeletePage = useCallback(
    (pageId: string) => {
      workspace.docCollection.removeDoc(pageId);
    },
    [workspace]
  );

  const duplicate = useAsyncCallback(
    async (pageId: string, openPageAfterDuplication: boolean = true) => {
      const currentPagePrimaryMode =
        docRecordList.doc$(pageId).value?.primaryMode$.value;
      const currentPageMeta = getDocMeta(pageId);
      const newPage = createDoc();
      const currentPage = workspace.docCollection.getDoc(pageId);

      newPage.load();
      if (!currentPageMeta || !currentPage) {
        return;
      }

      const update = encodeStateAsUpdate(currentPage.spaceDoc);
      applyUpdate(newPage.spaceDoc, update);

      setDocMeta(newPage.id, {
        tags: currentPageMeta.tags,
      });

      const lastDigitRegex = /\((\d+)\)$/;
      const match = currentPageMeta?.title?.match(lastDigitRegex);
      const newNumber = match ? parseInt(match[1], 10) + 1 : 1;

      const newPageTitle =
        currentPageMeta?.title?.replace(lastDigitRegex, '') + `(${newNumber})`;

      docRecordList
        .doc$(newPage.id)
        .value?.setPrimaryMode(currentPagePrimaryMode || ('page' as DocMode));
      setDocTitle(newPage.id, newPageTitle);
      openPageAfterDuplication &&
        openPage(workspace.docCollection.id, newPage.id);
    },
    [
      docRecordList,
      getDocMeta,
      createDoc,
      workspace.docCollection,
      setDocMeta,
      setDocTitle,
      openPage,
    ]
  );

  return {
    removeToTrash,
    restoreFromTrash,
    permanentlyDeletePage,

    duplicate,
  };
}
