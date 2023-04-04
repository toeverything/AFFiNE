import type { PageMeta } from '@blocksuite/store';
import { nanoid } from '@blocksuite/store';
import { useCallback } from 'react';

import type { BlockSuiteWorkspace } from '../shared';
import { useBlockSuiteWorkspaceName } from './use-blocksuite-workspace-name';
import { usePageMeta } from './use-page-meta';

export const usePivotHelper = ({
  blockSuiteWorkspace,
}: {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  meta: PageMeta;
}) => {
  const metas = usePageMeta(blockSuiteWorkspace);
  const [name] = useBlockSuiteWorkspaceName(blockSuiteWorkspace);

  const createRootPivot = useCallback(() => {
    const id = nanoid();
    const page = blockSuiteWorkspace.createPage(id);

    const pageBlockId = page.addBlock('affine:page', {
      title: new page.Text(`${name}'s Pinboard`),
    });
    page.addBlock('affine:surface', {}, null);
    const frameId = page.addBlock('affine:frame', {}, pageBlockId);
    return {
      frameId,
    };
    // page.addBlock('affine:paragraph', {}, frameId);
  }, [blockSuiteWorkspace, name]);
  const initRootPivotPage = () => {
    const rootPivotPageMeta = metas.find(m => m.isRootPivot);
    if (!rootPivotPageMeta) {
      const { frameId } = createRootPivot();
    }
    // getBlockByFlavour
  };
};
