import { PageListHeader } from '@/components/header';
import { PageList } from '@/components/page-list';
import { FavouritesIcon } from '@blocksuite/icons';
import usePageMetaList from '@/hooks/use-page-meta-list';
import { ReactElement } from 'react';
import WorkspaceLayout from '@/components/workspace-layout';

export const Favorite = () => {
  const pageMetaList = usePageMetaList();
  return (
    <>
      <PageListHeader icon={<FavouritesIcon />}>Favourites</PageListHeader>
      <PageList pageList={pageMetaList.filter(p => p.favorite && !p.trash)} />
    </>
  );
};
Favorite.getLayout = function getLayout(page: ReactElement) {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
export default Favorite;
