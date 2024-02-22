import type { PageBlockModel } from '@blocksuite/blocks';
import { assertExists } from '@blocksuite/global/utils';
import type { PageMeta, Workspace } from '@blocksuite/store';
import { useMemo } from 'react';

import { useAllBlockSuitePageMeta } from './use-all-block-suite-page-meta';
import { useJournalHelper } from './use-journal';

/**
 * Get pageMetas excluding journal pages without updatedDate
 * If you want to get all pageMetas, use `useAllBlockSuitePageMeta` instead
 * @returns
 */
export function useBlockSuitePageMeta(blocksuiteWorkspace: Workspace) {
  const pageMetas = useAllBlockSuitePageMeta(blocksuiteWorkspace);
  const { isPageJournal } = useJournalHelper(blocksuiteWorkspace);
  return useMemo(
    () =>
      pageMetas.filter(
        pageMeta => !isPageJournal(pageMeta.id) || !!pageMeta.updatedDate
      ),
    [isPageJournal, pageMetas]
  );
}

export function usePageMetaHelper(blockSuiteWorkspace: Workspace) {
  return useMemo(
    () => ({
      setPageTitle: (pageId: string, newTitle: string) => {
        const page = blockSuiteWorkspace.getPage(pageId);
        assertExists(page);
        const pageBlock = page
          .getBlockByFlavour('affine:page')
          .at(0) as PageBlockModel;
        assertExists(pageBlock);
        page.transact(() => {
          pageBlock.title.delete(0, pageBlock.title.length);
          pageBlock.title.insert(newTitle, 0);
        });
        blockSuiteWorkspace.meta.setPageMeta(pageId, { title: newTitle });
      },
      setPageReadonly: (pageId: string, readonly: boolean) => {
        const page = blockSuiteWorkspace.getPage(pageId);
        assertExists(page);
        page.awarenessStore.setReadonly(page, readonly);
      },
      setPageMeta: (pageId: string, pageMeta: Partial<PageMeta>) => {
        blockSuiteWorkspace.meta.setPageMeta(pageId, pageMeta);
      },
      getPageMeta: (pageId: string) => {
        return blockSuiteWorkspace.meta.getPageMeta(pageId);
      },
    }),
    [blockSuiteWorkspace]
  );
}
