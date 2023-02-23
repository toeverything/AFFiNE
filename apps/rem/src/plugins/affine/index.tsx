import dynamic from 'next/dynamic';
import React from 'react';

import { BlockSuitePageList } from '../../components/blocksuite/block-suite-page-list';
import { PageNotFoundError } from '../../components/BlockSuiteErrorBoundary';
import { PageDetailEditor } from '../../components/page-detail-editor';
import { RemWorkspaceFlavour } from '../../shared';
import { UIPlugin } from '../index';

const WIP = () => <div>WIP</div>;

const Editor = dynamic(
  async () =>
    (await import('../../components/blocksuite/block-suite-editor'))
      .BlockSuiteEditor,
  {
    ssr: false,
  }
);

export const AffineUIPlugin: UIPlugin<RemWorkspaceFlavour.AFFINE> = {
  flavour: RemWorkspaceFlavour.AFFINE,
  PageDetail: ({ currentWorkspace, currentPageId }) => {
    if (!currentWorkspace.firstBinarySynced) {
      return <div>Loading</div>;
    }
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
  PageList: ({ blockSuiteWorkspace, onClickPage }) => {
    return (
      <BlockSuitePageList
        onClickPage={onClickPage}
        blockSuiteWorkspace={blockSuiteWorkspace}
      />
    );
  },
  SettingPanel: WIP,
};
