import type { Doc, DocCollection } from '@blocksuite/store';
import { useMemo } from 'react';

export function useDocCollectionHelper(docCollection: DocCollection) {
  return useMemo(
    () => ({
      createDoc: (pageId?: string): Doc => {
        return docCollection.createDoc({ id: pageId });
      },
    }),
    [docCollection]
  );
}
