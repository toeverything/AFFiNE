import type { Page } from '@blocksuite/store';
import { useCallback, useEffect, useState } from 'react';

declare module '@blocksuite/store' {
  interface PageMeta {
    isPublic?: boolean;
  }
}

export function useBlockSuiteWorkspacePageIsPublic(page: Page) {
  const [isPublic, set] = useState<boolean>(() => page.meta.isPublic ?? false);
  useEffect(() => {
    const disposable = page.workspace.meta.pageMetasUpdated.on(() => {
      set(page.meta.isPublic ?? false);
    });
    return () => {
      disposable.dispose();
    };
  }, [page]);
  const setIsPublic = useCallback(
    (isPublic: boolean) => {
      set(isPublic);
      page.workspace.setPageMeta(page.id, {
        isPublic,
      });
    },
    [page.id, page.workspace]
  );
  return [isPublic, setIsPublic] as const;
}
