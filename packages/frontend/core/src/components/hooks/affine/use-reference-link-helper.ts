import type { AffineTextAttributes } from '@blocksuite/affine/shared/types';
import {
  type DeltaInsert,
  Text,
  type Workspace,
} from '@blocksuite/affine/store';
import { useCallback } from 'react';

export function useReferenceLinkHelper(docCollection: Workspace) {
  const addReferenceLink = useCallback(
    (pageId: string, referenceId: string) => {
      const page = docCollection?.getDoc(pageId)?.getStore();
      if (!page) {
        return;
      }
      const text = new Text([
        {
          insert: ' ',
          attributes: {
            reference: {
              type: 'Subpage',
              pageId: referenceId,
            },
          },
        },
      ] as DeltaInsert<AffineTextAttributes>[]);
      const [frame] = page.getModelsByFlavour('affine:note');

      frame && page.addBlock('affine:paragraph', { text }, frame.id);
    },
    [docCollection]
  );

  return {
    addReferenceLink,
  };
}
