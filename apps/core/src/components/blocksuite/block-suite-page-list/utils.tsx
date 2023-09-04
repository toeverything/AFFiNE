import { toast } from '@affine/component';
import { WorkspaceSubPath } from '@affine/env/workspace';
import { useBlockSuiteWorkspaceHelper } from '@toeverything/hooks/use-block-suite-workspace-helper';
import { initEmptyPage } from '@toeverything/infra/blocksuite';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { pageSettingsAtom, setPageModeAtom } from '../../../atoms';
import { useNavigateHelper } from '../../../hooks/use-navigate-helper';
import type { BlockSuiteWorkspace } from '../../../shared';

export const usePageHelper = (blockSuiteWorkspace: BlockSuiteWorkspace) => {
  const { openPage, jumpToSubPath } = useNavigateHelper();
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
      setPageMode(page.id, mode || 'page');
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
    const onSuccess = (pageIds: string[], isWorkspaceFile: boolean) => {
      toast(
        `Successfully imported ${pageIds.length} Page${
          pageIds.length > 1 ? 's' : ''
        }.`
      );
      if (isWorkspaceFile) {
        jumpToSubPath(blockSuiteWorkspace.id, WorkspaceSubPath.ALL);
        return;
      }

      if (pageIds.length === 0) {
        return;
      }
      const pageId = pageIds[0];
      openPage(blockSuiteWorkspace.id, pageId);
    };
    showImportModal({ workspace: blockSuiteWorkspace, onSuccess });
  }, [blockSuiteWorkspace, openPage, jumpToSubPath]);
  return {
    createPage: createPageAndOpen,
    createEdgeless: createEdgelessAndOpen,
    importFile: importFileAndOpen,
    isPreferredEdgeless: isPreferredEdgeless,
  };
};
