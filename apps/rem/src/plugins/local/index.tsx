import React from 'react';

import { BlockSuitePageList } from '../../components/blocksuite/block-suite-page-list';
import { PageNotFoundError } from '../../components/BlockSuiteErrorBoundary';
import { PageDetailEditor } from '../../components/page-detail-editor';
import { RemWorkspaceFlavour } from '../../shared';
import { UIPlugin } from '../index';

const WIP = () => <div>WIP</div>;

export const LocalUIPlugin: UIPlugin<RemWorkspaceFlavour.LOCAL> = {
  flavour: RemWorkspaceFlavour.LOCAL,
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
