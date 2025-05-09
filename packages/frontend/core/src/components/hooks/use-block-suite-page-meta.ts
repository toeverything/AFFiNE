import { DocsService } from '@affine/core/modules/doc';
import type { DocMeta, Workspace } from '@blocksuite/affine/store';
import { useService } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { useAsyncCallback } from './affine-async-hooks';
import { useAllBlockSuiteDocMeta } from './use-all-block-suite-page-meta';
import { useJournalInfoHelper } from './use-journal';

/**
 * Get pageMetas excluding journal pages without updatedDate
 * If you want to get all pageMetas, use `useAllBlockSuitePageMeta` instead
 * @returns
 */
export function useBlockSuiteDocMeta(docCollection: Workspace) {
  const pageMetas = useAllBlockSuiteDocMeta(docCollection);
  const { isPageJournal } = useJournalInfoHelper();
  return useMemo(
    () =>
      pageMetas.filter(
        pageMeta => !isPageJournal(pageMeta.id) || !!pageMeta.updatedDate
      ),
    [isPageJournal, pageMetas]
  );
}

export function useDocMetaHelper() {
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

  return useMemo(
    () => ({
      setDocTitle,
      setDocMeta,
      getDocMeta,
    }),
    [getDocMeta, setDocMeta, setDocTitle]
  );
}
