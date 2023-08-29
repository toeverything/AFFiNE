import type { PageBlockModel } from '@blocksuite/blocks';
import { assertExists } from '@blocksuite/global/utils';
import type { PageMeta, Workspace } from '@blocksuite/store';
import type { Atom } from 'jotai';
import { atom, useAtomValue } from 'jotai';
import { useMemo } from 'react';

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
