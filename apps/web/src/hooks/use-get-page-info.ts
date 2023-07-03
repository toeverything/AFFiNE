import type { GetPageInfoById } from '@affine/env/page-info';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useAtomValue } from 'jotai';
import { useMemo } from 'react';

import { pageSettingsAtom } from '../atoms';
import { rootCurrentWorkspaceAtom } from '../atoms/root';

export const useGetPageInfoById = (): GetPageInfoById => {
  const currentWorkspace = useAtomValue(rootCurrentWorkspaceAtom);
  const pageMetas = useBlockSuitePageMeta(currentWorkspace.blockSuiteWorkspace);
  const pageMap = useMemo(
    () => Object.fromEntries(pageMetas.map(page => [page.id, page])),
    [pageMetas]
  );
  const pageSettings = useAtomValue(pageSettingsAtom);
  return (id: string) => {
    const page = pageMap[id];
    if (!page) {
      return;
    }
    return {
      ...page,
      isEdgeless: pageSettings[id]?.mode === 'edgeless',
    };
  };
};
