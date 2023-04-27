import { useCallback } from 'react';

import type { BlockSuiteWorkspace } from '../../shared';

export function useReferenceLinkHelper(
  blockSuiteWorkspace: BlockSuiteWorkspace
) {
  const addReferenceLink = useCallback(
    (pageId: string, referenceId: string) => {
      const page = blockSuiteWorkspace?.getPage(pageId);
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
      const [frame] = page.getBlockByFlavour('affine:frame');

      frame && page.addBlock('affine:paragraph', { text }, frame.id);
    },
    [blockSuiteWorkspace]
  );
  const removeReferenceLink = useCallback(
    (deleteId: string) => {
      blockSuiteWorkspace.indexer.backlink.removeSubpageNode(
        blockSuiteWorkspace,
        deleteId
      );
    },
    [blockSuiteWorkspace]
  );

  return {
    addReferenceLink,
    removeReferenceLink,
  };
}
