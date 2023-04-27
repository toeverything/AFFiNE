import type { PageMeta } from '@blocksuite/store';
import { useMediaQuery, useTheme } from '@mui/material';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import type React from 'react';
import { useMemo } from 'react';

import type { BlockSuiteWorkspace } from '../../../shared';
import PageList, { PageListMobileView } from './page-list';
import { PageListEmpty } from './page-list/Empty';

export type BlockSuitePageListProps = {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  listType: 'all' | 'trash' | 'favorite' | 'shared' | 'public';
  isPublic?: true;
  onOpenPage: (pageId: string, newTab?: boolean) => void;
};

const filter = {
  all: (pageMeta: PageMeta) => !pageMeta.trash,
  public: (pageMeta: PageMeta) => !pageMeta.trash,
  trash: (pageMeta: PageMeta, allMetas: PageMeta[]) => {
    const parentMeta = allMetas.find(m => m.subpageIds?.includes(pageMeta.id));
    return !parentMeta?.trash && pageMeta.trash;
  },
  favorite: (pageMeta: PageMeta) => pageMeta.favorite && !pageMeta.trash,
  shared: (pageMeta: PageMeta) => pageMeta.isPublic && !pageMeta.trash,
};

export const BlockSuitePageList: React.FC<BlockSuitePageListProps> = ({
  blockSuiteWorkspace,
  onOpenPage,
  listType,
  isPublic = false,
}) => {
  const pageList = useBlockSuitePageMeta(blockSuiteWorkspace);
  const theme = useTheme();
  const isSmallDevices = useMediaQuery(theme.breakpoints.down('sm'));
  const list = useMemo(
    () => pageList.filter(pageMeta => filter[listType](pageMeta, pageList)),
    [pageList, listType]
  );
  if (list.length === 0) {
    return <PageListEmpty listType={listType} /> ?? null;
  }
  return isSmallDevices ? (
    <PageListMobileView list={list} onClickPage={onOpenPage} />
  ) : (
    <PageList
      blockSuiteWorkspace={blockSuiteWorkspace}
      onClickPage={onOpenPage}
      isPublic={isPublic}
      list={list}
      listType={listType}
    />
  );
};
