import { waitForCurrentWorkspaceAtom } from '@affine/workspace/atom';
import { useBlockSuiteWorkspacePage } from '@toeverything/hooks/use-block-suite-workspace-page';
import { currentPageIdAtom } from '@toeverything/infra/atom';
import { useAtomValue } from 'jotai';

export const useCurrentPage = () => {
  const currentPageId = useAtomValue(currentPageIdAtom);
  const currentWorkspace = useAtomValue(waitForCurrentWorkspaceAtom);

  return useBlockSuiteWorkspacePage(
    currentWorkspace?.blockSuiteWorkspace,
    currentPageId
  );
};
