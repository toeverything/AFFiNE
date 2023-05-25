import { Empty } from '@affine/component';
import type { ListData, TrashListData } from '@affine/component/page-list';
import { PageList, PageListTrashView } from '@affine/component/page-list';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { EdgelessIcon, PageIcon } from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import type React from 'react';
import { useMemo } from 'react';

import { useBlockSuiteMetaHelper } from '../../../hooks/affine/use-block-suite-meta-helper';
import type { BlockSuiteWorkspace } from '../../../shared';
import { toast } from '../../../utils';
import { pageListEmptyStyle } from './index.css';
import { usePageHelper } from './utils';

export type BlockSuitePageListProps = {
  blockSuiteWorkspace: BlockSuiteWorkspace;
  listType: 'all' | 'trash' | 'shared' | 'public';
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
  shared: (pageMeta: PageMeta) => pageMeta.isPublic && !pageMeta.trash,
};

const PageListEmpty = (props: {
  listType: BlockSuitePageListProps['listType'];
}) => {
  const { listType } = props;
  const t = useAFFiNEI18N();

  const getEmptyDescription = () => {
    if (listType === 'all') {
      return t['emptyAllPages']();
    }
    if (listType === 'trash') {
      return t['emptyTrash']();
    }
    if (listType === 'shared') {
      return t['emptySharedPages']();
    }
  };

  return (
    <div className={pageListEmptyStyle}>
      <Empty description={getEmptyDescription()} />
    </div>
  );
};

export const BlockSuitePageList: React.FC<BlockSuitePageListProps> = ({
  blockSuiteWorkspace,
  onOpenPage,
  listType,
  isPublic = false,
}) => {
  const pageMetas = useBlockSuitePageMeta(blockSuiteWorkspace);
  const {
    toggleFavorite,
    removeToTrash,
    restoreFromTrash,
    permanentlyDeletePage,
    cancelPublicPage,
  } = useBlockSuiteMetaHelper(blockSuiteWorkspace);
  const { createPage, createEdgeless, isPreferredEdgeless } =
    usePageHelper(blockSuiteWorkspace);
  const t = useAFFiNEI18N();
  const list = useMemo(
    () => pageMetas.filter(pageMeta => filter[listType](pageMeta, pageMetas)),
    [pageMetas, listType]
  );
  if (list.length === 0) {
    return <PageListEmpty listType={listType} />;
  }

  if (listType === 'trash') {
    const pageList: TrashListData[] = list.map(pageMeta => {
      return {
        icon: isPreferredEdgeless(pageMeta.id) ? (
          <EdgelessIcon />
        ) : (
          <PageIcon />
        ),
        pageId: pageMeta.id,
        title: pageMeta.title,
        createDate: new Date(pageMeta.createDate),
        trashDate: pageMeta.trashDate
          ? new Date(pageMeta.trashDate)
          : undefined,
        onClickPage: () => onOpenPage(pageMeta.id),
        onClickRestore: () => {
          restoreFromTrash(pageMeta.id);
        },
        onRestorePage: () => {
          restoreFromTrash(pageMeta.id);
          toast(t['restored']({ title: pageMeta.title || 'Untitled' }));
        },
        onPermanentlyDeletePage: () => {
          permanentlyDeletePage(pageMeta.id);
          toast(t['Permanently deleted']());
        },
      };
    });
    return <PageListTrashView list={pageList} />;
  }

  const pageList: ListData[] = list.map(pageMeta => {
    return {
      icon: isPreferredEdgeless(pageMeta.id) ? <EdgelessIcon /> : <PageIcon />,
      pageId: pageMeta.id,
      title: pageMeta.title,
      favorite: !!pageMeta.favorite,
      isPublicPage: !!pageMeta.isPublic,
      createDate: new Date(pageMeta.createDate),
      updatedDate: new Date(pageMeta.updatedDate ?? pageMeta.createDate),
      onClickPage: () => onOpenPage(pageMeta.id),
      onOpenPageInNewTab: () => onOpenPage(pageMeta.id, true),
      onClickRestore: () => {
        restoreFromTrash(pageMeta.id);
      },
      removeToTrash: () => {
        removeToTrash(pageMeta.id);
        toast(t['Successfully deleted']());
      },
      onRestorePage: () => {
        restoreFromTrash(pageMeta.id);
        toast(t['restored']({ title: pageMeta.title || 'Untitled' }));
      },
      bookmarkPage: () => {
        toggleFavorite(pageMeta.id);
        toast(
          pageMeta.favorite
            ? t['Removed from Favorites']()
            : t['Added to Favorites']()
        );
      },
      onDisablePublicSharing: () => {
        cancelPublicPage(pageMeta.id);
        toast('Successfully disabled', {
          portal: document.body,
        });
      },
    };
  });

  return (
    <PageList
      onCreateNewPage={createPage}
      onCreateNewEdgeless={createEdgeless}
      isPublicWorkspace={isPublic}
      list={pageList}
    />
  );
};
