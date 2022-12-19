import { usePageList } from '@/providers/app-state-provider/usePageList';
import { useLoadWorkspace } from '@/providers/app-state-provider/hooks';
import { PageListHeader } from '@/components/header';
import { PageList } from '@/components/page-list';
import { FavouritesIcon } from '@blocksuite/icons';

export const Favorite = () => {
  const workspace = useLoadWorkspace();
  const allPageList = usePageList(workspace);
  return workspace ? (
    <>
      <PageListHeader icon={<FavouritesIcon />}>Favourites</PageListHeader>
      <PageList pageList={allPageList.filter(p => p.favorite && !p.trash)} />
    </>
  ) : null;
};

export default Favorite;
