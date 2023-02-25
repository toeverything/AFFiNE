import React from 'react';

import { PageNotFoundError } from '../../components/blocksuite/block-suite-error-eoundary';
import { BlockSuitePageList } from '../../components/blocksuite/block-suite-page-list';
import { PageDetailEditor } from '../../components/page-detail-editor';
import { RemWorkspaceFlavour } from '../../shared';
import { WorkspacePlugin } from '../index';

const WIP = () => <div>WIP</div>;

export const LocalPlugin: WorkspacePlugin<RemWorkspaceFlavour.LOCAL> = {
  flavour: RemWorkspaceFlavour.LOCAL,
  prefetchData: async () => {},
  PageDetail: ({ currentWorkspace, currentPageId }) => {
    const page = currentWorkspace.blockSuiteWorkspace.getPage(currentPageId);
    if (!page) {
      throw new PageNotFoundError(
        currentWorkspace.blockSuiteWorkspace,
        currentPageId
      );
    }
    return (
      <>
        <PageDetailEditor
          pageId={currentPageId}
          blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
        />
      </>
    );
  },
  Setting: WIP,
  PageList: ({ blockSuiteWorkspace, onClickPage }) => {
    return (
      <BlockSuitePageList
        onClickPage={onClickPage}
        blockSuiteWorkspace={blockSuiteWorkspace}
      />
    );
  },
};
