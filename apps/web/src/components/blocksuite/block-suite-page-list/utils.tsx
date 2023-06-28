import { useBlockSuiteWorkspaceHelper } from '@toeverything/hooks/use-block-suite-workspace-helper';
import { useAtomValue, useSetAtom } from 'jotai';
import { useRouter } from 'next/router';
import { useCallback } from 'react';

import { pageSettingsAtom, setPageModeAtom } from '../../../atoms';
import { useRouterHelper } from '../../../hooks/use-router-helper';
import type { BlockSuiteWorkspace } from '../../../shared';

export const usePageHelper = (blockSuiteWorkspace: BlockSuiteWorkspace) => {
  const router = useRouter();
  const { openPage } = useRouterHelper(router);
  const { createPage } = useBlockSuiteWorkspaceHelper(blockSuiteWorkspace);
  const pageSettings = useAtomValue(pageSettingsAtom);
  const isPreferredEdgeless = useCallback(
    (pageId: string) => pageSettings[pageId]?.mode === 'edgeless',
    [pageSettings]
  );
  const setPageMode = useSetAtom(setPageModeAtom);
  const createPageAndOpen = useCallback(() => {
    const page = createPage();
    return openPage(blockSuiteWorkspace.id, page.id);
  }, [blockSuiteWorkspace.id, createPage, openPage]);
  const createEdgelessAndOpen = useCallback(() => {
    const page = createPage();
    setPageMode(page.id, 'edgeless');
    return openPage(blockSuiteWorkspace.id, page.id);
  }, [blockSuiteWorkspace.id, createPage, openPage, setPageMode]);
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
