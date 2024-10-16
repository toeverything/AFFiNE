import type { AffineTextAttributes } from '@blocksuite/affine/blocks';
import type { DeltaInsert } from '@blocksuite/affine/inline';
import type { DocCollection } from '@blocksuite/affine/store';
import { useCallback } from 'react';

export function useReferenceLinkHelper(docCollection: DocCollection) {
  const addReferenceLink = useCallback(
    (pageId: string, referenceId: string) => {
      const page = docCollection?.getDoc(pageId);
      if (!page) {
        return;
      }
      const text = new page.Text([
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
      const [frame] = page.getBlockByFlavour('affine:note');

      frame && page.addBlock('affine:paragraph', { text }, frame.id);
    },
    [docCollection]
  );

  return {
    addReferenceLink,
  };
}
