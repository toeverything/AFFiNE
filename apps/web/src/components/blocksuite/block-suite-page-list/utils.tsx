import { useBlockSuiteWorkspaceHelper } from '@toeverything/hooks/use-block-suite-workspace-helper';
import { useRouter } from 'next/router';

import { useWorkspacePreferredMode } from '../../../hooks/use-recent-views';
import { useRouterHelper } from '../../../hooks/use-router-helper';
import type { BlockSuiteWorkspace } from '../../../shared';

export const usePageHelper = (blockSuiteWorkspace: BlockSuiteWorkspace) => {
  const router = useRouter();
  const { openPage } = useRouterHelper(router);
  const { createPage } = useBlockSuiteWorkspaceHelper(blockSuiteWorkspace);
  const { getPreferredMode, setPreferredMode } = useWorkspacePreferredMode();
  const isPreferredEdgeless = (pageId: string) => {
    return getPreferredMode(pageId) === 'edgeless';
  };

  const createPageAndOpen = () => {
    const page = createPage();
    return openPage(blockSuiteWorkspace.id, page.id);
  };
  const createEdgelessAndOpen = () => {
    const page = createPage();
    setPreferredMode(page.id, 'edgeless');
    return openPage(blockSuiteWorkspace.id, page.id);
  };
  const importFileAndOpen = async () => {
    const { showImportModal } = await import('@blocksuite/blocks');
    showImportModal({ workspace: blockSuiteWorkspace });
  };
  return {
    createPage: createPageAndOpen,
    createEdgeless: createEdgelessAndOpen,
    importFile: importFileAndOpen,
    isPreferredEdgeless: isPreferredEdgeless,
  };
};
