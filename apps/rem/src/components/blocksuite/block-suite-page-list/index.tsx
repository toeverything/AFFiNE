import React from 'react';

import { BlockSuiteWorkspace } from '../../../shared';
import PageList from './page-list';

export type BlockSuitePageListProps = {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  onClickPage: (pageId: string) => void;
};

export const BlockSuitePageList: React.FC<BlockSuitePageListProps> = ({
  blockSuiteWorkspace,
  onClickPage,
}) => {
  return (
    <PageList
      blockSuiteWorkspace={blockSuiteWorkspace}
      onClickPage={onClickPage}
      isPublic={false}
      isTrash={false}
      listType="all"
    />
  );
};
