import { useBlockSuitePageMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import type { GetPageInfoById } from '@affine/env/page-info';
import type { Workspace } from '@blocksuite/store';
import { useAtomValue } from 'jotai';
import { useCallback, useMemo } from 'react';

import { pageSettingsAtom } from '../atoms';

export const useGetPageInfoById = (workspace: Workspace): GetPageInfoById => {
  const pageMetas = useBlockSuitePageMeta(workspace);
  const pageMap = useMemo(
    () => Object.fromEntries(pageMetas.map(page => [page.id, page])),
    [pageMetas]
  );
  const pageSettings = useAtomValue(pageSettingsAtom);
  return useCallback(
    (id: string) => {
      const page = pageMap[id];
      if (!page) {
        return;
      }
      return {
        ...page,
        isEdgeless: pageSettings[id]?.mode === 'edgeless',
      };
    },
    [pageMap, pageSettings]
  );
};
