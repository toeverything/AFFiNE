import { useLoadWorkspace } from '@/providers/app-state-provider/hooks';
import { PageListHeader } from '@/components/header';
import { PageList } from '@/components/page-list';
import { FavouritesIcon } from '@blocksuite/icons';
import usePageMetaList from '@/hooks/use-page-meta-list';

export const Favorite = () => {
  const workspace = useLoadWorkspace();
  const pageMetaList = usePageMetaList();
  return workspace ? (
    <>
      <PageListHeader icon={<FavouritesIcon />}>Favourites</PageListHeader>
      <PageList pageList={pageMetaList.filter(p => p.favorite && !p.trash)} />
    </>
  ) : null;
};

export default Favorite;
