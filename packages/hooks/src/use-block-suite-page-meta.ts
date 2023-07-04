import type { PageBlockModel } from '@blocksuite/blocks';
import { assertExists } from '@blocksuite/global/utils';
import type { PageMeta, Workspace } from '@blocksuite/store';
import type { Atom } from 'jotai';
import { atom, useAtomValue } from 'jotai';
import { useMemo } from 'react';

declare module '@blocksuite/store' {
  interface PageMeta {
    favorite?: boolean;
    subpageIds: string[];
    // If a page remove to trash, and it is a subpage, it will remove from its parent `subpageIds`, 'trashRelate' is use for save it parent
    trashRelate?: string;
    trash?: boolean;
    trashDate?: number;
    updatedDate?: number;
    mode?: 'page' | 'edgeless';
    jumpOnce?: boolean;
    // todo: support `number` in the future
    isPublic?: boolean;
  }
}

const weakMap = new WeakMap<Workspace, Atom<PageMeta[]>>();

export function useBlockSuitePageMeta(
  blockSuiteWorkspace: Workspace
): PageMeta[] {
  if (!weakMap.has(blockSuiteWorkspace)) {
    const baseAtom = atom<PageMeta[]>(blockSuiteWorkspace.meta.pageMetas);
    weakMap.set(blockSuiteWorkspace, baseAtom);
    baseAtom.onMount = set => {
      const dispose = blockSuiteWorkspace.meta.pageMetasUpdated.on(() => {
        set(blockSuiteWorkspace.meta.pageMetas);
      });
      return () => {
        dispose.dispose();
      };
    };
  }
  return useAtomValue(weakMap.get(blockSuiteWorkspace) as Atom<PageMeta[]>);
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
