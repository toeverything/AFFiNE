import { useBlockSuiteWorkspacePage } from '@affine/core/hooks/use-block-suite-workspace-page';
import { waitForCurrentWorkspaceAtom } from '@affine/workspace/atom';
import { useAtomValue } from 'jotai';

import { currentPageIdAtom } from '../../atoms/mode';

export const useCurrentPage = () => {
  const currentPageId = useAtomValue(currentPageIdAtom);
  const currentWorkspace = useAtomValue(waitForCurrentWorkspaceAtom);

  return useBlockSuiteWorkspacePage(
    currentWorkspace?.blockSuiteWorkspace,
    currentPageId
  );
};
