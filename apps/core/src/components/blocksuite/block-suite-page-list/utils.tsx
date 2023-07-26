import { initEmptyPage } from '@affine/env/blocksuite';
import { useBlockSuiteWorkspaceHelper } from '@toeverything/hooks/use-block-suite-workspace-helper';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { pageSettingsAtom, setPageModeAtom } from '../../../atoms';
import { useNavigateHelper } from '../../../hooks/use-navigate-helper';
import type { BlockSuiteWorkspace } from '../../../shared';

export const usePageHelper = (blockSuiteWorkspace: BlockSuiteWorkspace) => {
  const { openPage } = useNavigateHelper();
  const { createPage } = useBlockSuiteWorkspaceHelper(blockSuiteWorkspace);
  const pageSettings = useAtomValue(pageSettingsAtom);
  const isPreferredEdgeless = useCallback(
    (pageId: string) => pageSettings[pageId]?.mode === 'edgeless',
    [pageSettings]
  );
  const setPageMode = useSetAtom(setPageModeAtom);
  const createPageAndOpen = useCallback(
    (id?: string, mode?: 'page' | 'edgeless') => {
      const page = createPage(id);
      initEmptyPage(page); // we don't need to wait it to be loaded right?
      if (mode) {
        setPageMode(page.id, mode);
      }
      openPage(blockSuiteWorkspace.id, page.id);
    },
    [blockSuiteWorkspace.id, createPage, openPage, setPageMode]
  );
  const createEdgelessAndOpen = useCallback(
    (id?: string) => {
      return createPageAndOpen(id, 'edgeless');
    },
    [createPageAndOpen]
  );
  const importFileAndOpen = useCallback(async () => {
    const { showImportModal } = await import('@blocksuite/blocks');
    showImportModal({ workspace: blockSuiteWorkspace });
  }, [blockSuiteWorkspace]);
  return {
    createPage: createPageAndOpen,
    createEdgeless: createEdgelessAndOpen,
    importFile: importFileAndOpen,
    isPreferredEdgeless: isPreferredEdgeless,
  };
};
