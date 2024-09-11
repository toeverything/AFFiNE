import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useDocMetaHelper } from '@affine/core/hooks/use-block-suite-page-meta';
import { ZipTransformer } from '@blocksuite/blocks';
import {
  DocsService,
  useServices,
  WorkspaceService,
} from '@toeverything/infra';
import { useCallback } from 'react';

import { useNavigateHelper } from '../use-navigate-helper';

const getNewPageTitle = (title: string) => {
  const lastDigitRegex = /\((\d+)\)$/;
  const match = title.match(lastDigitRegex);
  const newNumber = match ? parseInt(match[1], 10) + 1 : 1;

  const newPageTitle = title.replace(lastDigitRegex, '') + `(${newNumber})`;
  return newPageTitle;
};

export function useBlockSuiteMetaHelper() {
  const { workspaceService, docsService } = useServices({
    WorkspaceService,
    DocsService,
  });
  const workspace = workspaceService.workspace;
  const { setDocMeta, getDocMeta, setDocTitle, setDocReadonly } =
    useDocMetaHelper();
  const { openPage } = useNavigateHelper();
  const docRecordList = docsService.list;

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
      const newPageTitle = getNewPageTitle(currentPageMeta?.title ?? '');

      const currentDoc = workspace.docCollection.getDoc(pageId);
      if (!currentPageMeta || !currentDoc) {
        return;
      }

      const currentDocData = await ZipTransformer.exportDocs(
        workspace.docCollection,
        [currentDoc]
      );
      const [importDoc] = await ZipTransformer.importDocs(
        workspace.docCollection,
        currentDocData
      );
      if (!importDoc) {
        return;
      }

      workspace.engine.doc.markAsReady(importDoc.id);
      const newDoc = importDoc.load(() => {
        importDoc.history.clear();
      });
      setDocMeta(newDoc.id, {
        tags: currentPageMeta.tags,
      });
      docRecordList
        .doc$(newDoc.id)
        .value?.setPrimaryMode(currentPagePrimaryMode || 'page');
      setDocTitle(newDoc.id, newPageTitle);

      openPageAfterDuplication &&
        openPage(workspace.docCollection.id, newDoc.id);
    },

    [docRecordList, getDocMeta, openPage, setDocMeta, setDocTitle, workspace]
  );

  return {
    removeToTrash,
    restoreFromTrash,
    permanentlyDeletePage,

    duplicate,
  };
}
