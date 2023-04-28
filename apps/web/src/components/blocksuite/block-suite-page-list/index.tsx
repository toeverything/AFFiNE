import { useTranslation } from '@affine/i18n';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import { useMediaQuery, useTheme } from '@mui/material';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useAtomValue } from 'jotai';
import type React from 'react';
import { useMemo } from 'react';

import { workspacePreferredModeAtom } from '../../../atoms';
import { useBlockSuiteMetaHelper } from '../../../hooks/affine/use-block-suite-meta-helper';
import type { BlockSuiteWorkspace } from '../../../shared';
import { toast } from '../../../utils';
import type { TrashListData } from './page-list';
import PageList, { PageListMobileView, PageListTrashView } from './page-list';
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
  const pageMetas = useBlockSuitePageMeta(blockSuiteWorkspace);
  const { restoreFromTrash, permanentlyDeletePage } =
    useBlockSuiteMetaHelper(blockSuiteWorkspace);
  const theme = useTheme();
  const { t } = useTranslation();
  const isSmallDevices = useMediaQuery(theme.breakpoints.down('sm'));
  const list = useMemo(
    () => pageMetas.filter(pageMeta => filter[listType](pageMeta, pageMetas)),
    [pageMetas, listType]
  );
  const record = useAtomValue(workspacePreferredModeAtom);
  if (list.length === 0) {
    return <PageListEmpty listType={listType} />;
  }

  if (isSmallDevices) {
    return (
      <PageListMobileView
        isPublic={isPublic}
        list={list}
        onClickPage={onOpenPage}
      />
    );
  }

  if (listType === 'trash') {
    const pageList: TrashListData[] = list.map(pageMeta => {
      return {
        icon:
          record[pageMeta.id] === 'edgeless' ? <EdgelessIcon /> : <PageIcon />,
        id: pageMeta.id,
        title: pageMeta.title,
        favorite: !!pageMeta.favorite,
        createDate: pageMeta.createDate,
        updatedDate: pageMeta.updatedDate as number | undefined,
        // isPublic: pageMeta.isPublic,
        onClickPage: () => onOpenPage(pageMeta.id),
        onClickRestore: () => {
          restoreFromTrash(pageMeta.id);
        },
        onRestorePage: () => {
          restoreFromTrash(pageMeta.id);
          toast(t('restored', { title: pageMeta.title || 'Untitled' }));
        },
        onPermanentlyDeletePage: () => {
          permanentlyDeletePage(pageMeta.id);
          toast(t('Permanently deleted'));
        },
      };
    });
    return <PageListTrashView list={pageList} />;
  }

  return (
    <PageList
      blockSuiteWorkspace={blockSuiteWorkspace}
      onClickPage={onOpenPage}
      isPublic={isPublic}
      list={list}
      listType={listType}
    />
  );
};
