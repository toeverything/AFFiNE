import type { Store, Workspace } from '@blocksuite/affine/store';
import { useMemo } from 'react';

export function useDocCollectionHelper(docCollection: Workspace) {
  return useMemo(
    () => ({
      createDoc: (pageId?: string): Store => {
        return docCollection.createDoc(pageId).getStore();
      },
    }),
    [docCollection]
  );
}
