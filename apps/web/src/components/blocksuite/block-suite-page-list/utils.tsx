import { useBlockSuiteWorkspaceHelper } from '@toeverything/hooks/use-block-suite-workspace-helper';
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { useRouter } from 'next/router';

import { useWorkspacePreferredMode } from '../../../hooks/use-recent-views';
import { useRouterHelper } from '../../../hooks/use-router-helper';
import type { BlockSuiteWorkspace } from '../../../shared';

dayjs.extend(localizedFormat);
export const formatDate = (date?: number | unknown) => {
  const dateStr =
    typeof date === 'number' ? dayjs(date).format('MM-DD HH:mm') : '--';
  return dateStr;
};

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
    openPage(blockSuiteWorkspace.id, page.id);
  };
  const createEdgelessAndOpen = () => {
    const page = createPage();
    setPreferredMode(page.id, 'edgeless');
    openPage(blockSuiteWorkspace.id, page.id);
  };
  return {
    createPage: createPageAndOpen,
    createEdgeless: createEdgelessAndOpen,
    isPreferredEdgeless: isPreferredEdgeless,
  };
};
