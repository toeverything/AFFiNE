import type { PageBlockModel } from '@blocksuite/blocks';
import type { PageMeta } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import { useEffect, useMemo, useState } from 'react';

import type { BlockSuiteWorkspace } from '../shared';

declare module '@blocksuite/store' {
  interface PageMeta {
    favorite?: boolean;
    subpageIds: string[];
    // If a page remove to trash, and it is a subpage, it will remove from its parent `subpageIds`, 'trashRelate' is use for save it parent
    trashRelate?: string;
    trash?: boolean;
    trashDate?: number;
    // whether to create the page with the default template
    init?: boolean;
    isRootPinboard?: boolean;
  }
}

export function usePageMeta(
  blockSuiteWorkspace: BlockSuiteWorkspace | null
): PageMeta[] {
  const [pageMeta, setPageMeta] = useState<PageMeta[]>(
    () => blockSuiteWorkspace?.meta.pageMetas ?? []
  );
  const [prev, setPrev] = useState(() => blockSuiteWorkspace);
  if (prev !== blockSuiteWorkspace) {
    setPrev(blockSuiteWorkspace);
    if (blockSuiteWorkspace) {
      setPageMeta(blockSuiteWorkspace.meta.pageMetas);
    }
  }
  useEffect(() => {
    if (blockSuiteWorkspace) {
      const dispose = blockSuiteWorkspace.meta.pageMetasUpdated.on(() => {
        setPageMeta(blockSuiteWorkspace.meta.pageMetas);
      });
      return () => {
        dispose.dispose();
      };
    }
  }, [blockSuiteWorkspace]);
  return pageMeta;
}

export function usePageMetaHelper(
  blockSuiteWorkspace: BlockSuiteWorkspace | null
) {
  return useMemo(
    () => ({
      setPageTitle: (pageId: string, newTitle: string) => {
        assertExists(blockSuiteWorkspace);
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
        assertExists(blockSuiteWorkspace);
        blockSuiteWorkspace.meta.setPageMeta(pageId, { title: newTitle });
      },
      setPageMeta: (pageId: string, pageMeta: Partial<PageMeta>) => {
        assertExists(blockSuiteWorkspace);
        blockSuiteWorkspace.meta.setPageMeta(pageId, pageMeta);
      },
      getPageMeta: (pageId: string) => {
        assertExists(blockSuiteWorkspace);
        return blockSuiteWorkspace.meta.getPageMeta(pageId);
      },
      shiftPageMeta: (pageId: string, index: number) => {
        assertExists(blockSuiteWorkspace);
        return blockSuiteWorkspace.meta.shiftPageMeta(pageId, index);
      },
    }),
    [blockSuiteWorkspace]
  );
}
