import type { AllPageListConfig } from '@affine/component/page-list';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useMemo } from 'react';

import { usePageHelper } from '../../components/blocksuite/block-suite-page-list/utils';
import { useCurrentWorkspace } from '../current/use-current-workspace';

export const useAllPageListConfig = () => {
  const [currentWorkspace] = useCurrentWorkspace();
  const workspace = currentWorkspace.blockSuiteWorkspace;
  const pageMetas = useBlockSuitePageMeta(workspace);
  const { isPreferredEdgeless } = usePageHelper(workspace);
  const pageMap = useMemo(
    () => Object.fromEntries(pageMetas.map(page => [page.id, page])),
    [pageMetas]
  );
  return useMemo<AllPageListConfig>(() => {
    return {
      allPages: pageMetas,
      isEdgeless: isPreferredEdgeless,
      workspace: currentWorkspace.blockSuiteWorkspace,
      getPage: id => pageMap[id],
    };
  }, [
    currentWorkspace.blockSuiteWorkspace,
    isPreferredEdgeless,
    pageMetas,
    pageMap,
  ]);
};
