import type { DocCollection, DocMeta } from '@blocksuite/store';
import { DocsService, useService, WorkspaceService } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { useAsyncCallback } from './affine-async-hooks';
import { useAllBlockSuiteDocMeta } from './use-all-block-suite-page-meta';
import { useJournalHelper } from './use-journal';

/**
 * Get pageMetas excluding journal pages without updatedDate
 * If you want to get all pageMetas, use `useAllBlockSuitePageMeta` instead
 * @returns
 */
export function useBlockSuiteDocMeta(docCollection: DocCollection) {
  const pageMetas = useAllBlockSuiteDocMeta(docCollection);
  const { isPageJournal } = useJournalHelper(docCollection);
  return useMemo(
    () =>
      pageMetas.filter(
        pageMeta => !isPageJournal(pageMeta.id) || !!pageMeta.updatedDate
      ),
    [isPageJournal, pageMetas]
  );
}

export function useDocMetaHelper() {
  const workspaceService = useService(WorkspaceService);
  const docsService = useService(DocsService);

  const setDocTitle = useAsyncCallback(
    async (docId: string, newTitle: string) => {
      await docsService.changeDocTitle(docId, newTitle);
    },
    [docsService]
  );

  const setDocMeta = useCallback(
    (docId: string, docMeta: Partial<DocMeta>) => {
      const doc = docsService.list.doc$(docId).value;
      if (doc) {
        doc.setMeta(docMeta);
      }
    },
    [docsService]
  );

  const getDocMeta = useCallback(
    (docId: string) => {
      const doc = docsService.list.doc$(docId).value;
      return doc?.meta$.value;
    },
    [docsService]
  );
  const setDocReadonly = useCallback(
    (docId: string, readonly: boolean) => {
      const doc = workspaceService.workspace.docCollection.getDoc(docId);
      if (doc?.blockCollection) {
        workspaceService.workspace.docCollection.awarenessStore.setReadonly(
          doc.blockCollection,
          readonly
        );
      }
    },
    [workspaceService]
  );

  return useMemo(
    () => ({
      setDocTitle,
      setDocMeta,
      getDocMeta,
      setDocReadonly,
    }),
    [getDocMeta, setDocMeta, setDocReadonly, setDocTitle]
  );
}
