import { PageListHeader } from '@/components/header';
import { useEditor } from '@/providers/editor-provider';
import { PageList } from '@/components/page-list';
import { FavouritesIcon } from '@blocksuite/icons';

export const Favorite = () => {
  const { pageList: allPageList } = useEditor();
  return (
    <>
      <PageListHeader icon={<FavouritesIcon />}>Favorites</PageListHeader>
      <PageList pageList={allPageList.filter(p => p.favorite && !p.trash)} />
    </>
  );
};

export default Favorite;
