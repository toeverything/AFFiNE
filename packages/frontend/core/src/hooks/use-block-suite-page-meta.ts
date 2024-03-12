import type { RootBlockModel } from '@blocksuite/blocks';
import { assertExists } from '@blocksuite/global/utils';
import type { DocMeta, Workspace } from '@blocksuite/store';
import { useMemo } from 'react';

import { useAllBlockSuiteDocMeta } from './use-all-block-suite-page-meta';
import { useJournalHelper } from './use-journal';

/**
 * Get pageMetas excluding journal pages without updatedDate
 * If you want to get all pageMetas, use `useAllBlockSuitePageMeta` instead
 * @returns
 */
export function useBlockSuiteDocMeta(blocksuiteWorkspace: Workspace) {
  const pageMetas = useAllBlockSuiteDocMeta(blocksuiteWorkspace);
  const { isPageJournal } = useJournalHelper(blocksuiteWorkspace);
  return useMemo(
    () =>
      pageMetas.filter(
        pageMeta => !isPageJournal(pageMeta.id) || !!pageMeta.updatedDate
      ),
    [isPageJournal, pageMetas]
  );
}

export function useDocMetaHelper(blockSuiteWorkspace: Workspace) {
  return useMemo(
    () => ({
      setDocTitle: (docId: string, newTitle: string) => {
        const page = blockSuiteWorkspace.getDoc(docId);
        assertExists(page);
        const pageBlock = page
          .getBlockByFlavour('affine:page')
          .at(0) as RootBlockModel;
        assertExists(pageBlock);
        page.transact(() => {
          pageBlock.title.delete(0, pageBlock.title.length);
          pageBlock.title.insert(newTitle, 0);
        });
        blockSuiteWorkspace.meta.setDocMeta(docId, { title: newTitle });
      },
      setDocReadonly: (docId: string, readonly: boolean) => {
        const page = blockSuiteWorkspace.getDoc(docId);
        assertExists(page);
        page.awarenessStore.setReadonly(page, readonly);
      },
      setDocMeta: (docId: string, docMeta: Partial<DocMeta>) => {
        blockSuiteWorkspace.meta.setDocMeta(docId, docMeta);
      },
      getDocMeta: (docId: string) => {
        return blockSuiteWorkspace.meta.getDocMeta(docId);
      },
    }),
    [blockSuiteWorkspace]
  );
}
