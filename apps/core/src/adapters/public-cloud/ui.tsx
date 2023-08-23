import { initEmptyPage } from '@affine/env/blocksuite';
import { PageNotFoundError } from '@affine/env/constant';
import type { WorkspaceFlavour } from '@affine/env/workspace';
import { type WorkspaceUISchema } from '@affine/env/workspace';
import { useCallback } from 'react';

import { useWorkspace } from '../../hooks/use-workspace';
import { BlockSuitePageList, PageDetailEditor, Provider } from '../shared';

export const UI = {
  Provider,
  Header: () => {
    return null;
  },
  PageDetail: ({ currentWorkspaceId, currentPageId, onLoadEditor }) => {
    const workspace = useWorkspace(currentWorkspaceId);
    const page = workspace.blockSuiteWorkspace.getPage(currentPageId);
    if (!page) {
      throw new PageNotFoundError(workspace.blockSuiteWorkspace, currentPageId);
    }
    return (
      <>
        <PageDetailEditor
          pageId={currentPageId}
          onInit={useCallback(async page => initEmptyPage(page), [])}
          onLoad={onLoadEditor}
          workspace={workspace.blockSuiteWorkspace}
        />
      </>
    );
  },
  PageList: ({ blockSuiteWorkspace, onOpenPage, collection }) => {
    return (
      <BlockSuitePageList
        listType="all"
        collection={collection}
        onOpenPage={onOpenPage}
        blockSuiteWorkspace={blockSuiteWorkspace}
      />
    );
  },
  NewSettingsDetail: () => {
    throw new Error('Not implemented');
  },
} satisfies WorkspaceUISchema<WorkspaceFlavour.AFFINE_PUBLIC>;
