import type { RootBlockModel } from '@blocksuite/blocks';
import { assertExists } from '@blocksuite/global/utils';
import type { DocCollection, DocMeta } from '@blocksuite/store';
import { useMemo } from 'react';

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

export function useDocMetaHelper(docCollection: DocCollection) {
  return useMemo(
    () => ({
      setDocTitle: (docId: string, newTitle: string) => {
        const page = docCollection.getDoc(docId);
        assertExists(page);
        const pageBlock = page
          .getBlockByFlavour('affine:page')
          .at(0) as RootBlockModel;
        assertExists(pageBlock);
        page.transact(() => {
          pageBlock.title.delete(0, pageBlock.title.length);
          pageBlock.title.insert(newTitle, 0);
        });
        docCollection.meta.setDocMeta(docId, { title: newTitle });
      },
      setDocReadonly: (docId: string, readonly: boolean) => {
        const page = docCollection.getDoc(docId);
        assertExists(page);
        page.awarenessStore.setReadonly(page, readonly);
      },
      setDocMeta: (docId: string, docMeta: Partial<DocMeta>) => {
        docCollection.meta.setDocMeta(docId, docMeta);
      },
      getDocMeta: (docId: string) => {
        return docCollection.meta.getDocMeta(docId);
      },
    }),
    [docCollection]
  );
}
