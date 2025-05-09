import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { DocsService } from '@affine/core/modules/doc';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useService } from '@toeverything/infra';
import { useCallback } from 'react';

import { useNavigateHelper } from '../use-navigate-helper';

export function useBlockSuiteMetaHelper() {
  const workspace = useService(WorkspaceService).workspace;
  const { openPage } = useNavigateHelper();
  const docsService = useService(DocsService);
  const docRecordList = useService(DocsService).list;

  // TODO-Doma
  // "Remove" may cause ambiguity here. Consider renaming as "moveToTrash".
  const removeToTrash = useCallback(
    (docId: string) => {
      const docRecord = docRecordList.doc$(docId).value;
      if (docRecord) {
        docRecord.moveToTrash();
      }
    },
    [docRecordList]
  );

  const restoreFromTrash = useCallback(
    (docId: string) => {
      const docRecord = docRecordList.doc$(docId).value;
      if (docRecord) {
        docRecord.restoreFromTrash();
      }
    },
    [docRecordList]
  );

  const permanentlyDeletePage = useCallback(
    (pageId: string) => {
      workspace.docCollection.removeDoc(pageId);
    },
    [workspace]
  );

  const duplicate = useAsyncCallback(
    async (pageId: string, openPageAfterDuplication: boolean = true) => {
      const newPageId = await docsService.duplicate(pageId);
      openPageAfterDuplication &&
        openPage(workspace.docCollection.id, newPageId);
    },
    [docsService, openPage, workspace.docCollection.id]
  );

  return {
    removeToTrash,
    restoreFromTrash,
    permanentlyDeletePage,

    duplicate,
  };
}
