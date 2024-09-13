import type { DocCollection } from '@blocksuite/store';
import { useCallback } from 'react';

export function useReferenceLinkHelper(docCollection: DocCollection) {
  const addReferenceLink = useCallback(
    (pageId: string, referenceId: string) => {
      const page = docCollection?.getDoc(pageId);
      if (!page) {
        return;
      }
      const text = page.Text.fromDelta([
        {
          insert: ' ',
          attributes: {
            reference: {
              type: 'Subpage',
              pageId: referenceId,
            },
          },
        },
      ]);
      const [frame] = page.getBlockByFlavour('affine:note');

      frame && page.addBlock('affine:paragraph', { text }, frame.id);
    },
    [docCollection]
  );

  return {
    addReferenceLink,
  };
}
