import React from 'react';

import { BlockSuiteWorkspace } from '../../../shared';
import PageList from './page-list';

export type BlockSuitePageListProps = {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  onOpenPage: (pageId: string, newTab?: boolean) => void;
};

export const BlockSuitePageList: React.FC<BlockSuitePageListProps> = ({
  blockSuiteWorkspace,
  onOpenPage,
}) => {
  return (
    <PageList
      blockSuiteWorkspace={blockSuiteWorkspace}
      onClickPage={onOpenPage}
      listType="all"
    />
  );
};

export const BlockSuitePublicPageList: React.FC<BlockSuitePageListProps> = ({
  blockSuiteWorkspace,
  onOpenPage,
}) => {
  return (
    <PageList
      isPublic={true}
      blockSuiteWorkspace={blockSuiteWorkspace}
      onClickPage={onOpenPage}
      listType="all"
    />
  );
};
