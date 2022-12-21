import { useLoadWorkspace } from '@/providers/app-state-provider/hooks';
import { PageListHeader } from '@/components/header';
import { PageList } from '@/components/page-list';
import { FavouritesIcon } from '@blocksuite/icons';
import usePageMetaList from '@/hooks/use-page-meta-list';
import { NextPageWithLayout } from '@/pages/_app';
import { ReactElement } from 'react';
import WorkspaceLayout from '@/components/workspace-layout';

export const Favorite: NextPageWithLayout = () => {
  const workspace = useLoadWorkspace();
  const pageMetaList = usePageMetaList();
  return workspace ? (
    <>
      <PageListHeader icon={<FavouritesIcon />}>Favourites</PageListHeader>
      <PageList pageList={pageMetaList.filter(p => p.favorite && !p.trash)} />
    </>
  ) : null;
};
Favorite.getLayout = function getLayout(page: ReactElement) {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
export default Favorite;
