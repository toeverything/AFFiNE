import { useBlockSuiteWorkspacePage } from '@affine/core/hooks/use-block-suite-workspace-page';
import { Workspace } from '@toeverything/infra';
import { useService } from '@toeverything/infra/di';
import { useAtomValue } from 'jotai';

import { currentPageIdAtom } from '../../atoms/mode';

export const useCurrentPage = () => {
  const currentPageId = useAtomValue(currentPageIdAtom);
  const currentWorkspace = useService(Workspace);
  return useBlockSuiteWorkspacePage(
    currentWorkspace.blockSuiteWorkspace,
    currentPageId
  );
};
