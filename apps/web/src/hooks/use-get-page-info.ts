import type { GetPageInfoById } from '@affine/env/page-info';
import type { Workspace } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { usePassiveWorkspaceEffect } from '@toeverything/plugin-infra/__internal__/workspace';
import { useAtomValue } from 'jotai';
import { useMemo } from 'react';

import { pageSettingsAtom } from '../atoms';

export const useGetPageInfoById = (workspace: Workspace): GetPageInfoById => {
  usePassiveWorkspaceEffect(workspace);
  const pageMetas = useBlockSuitePageMeta(workspace);
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
