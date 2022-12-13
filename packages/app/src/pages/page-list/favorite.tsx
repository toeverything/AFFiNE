import { Header } from '@/components/header';
import { useEditor } from '@/providers/editor-provider';
import { PageList } from '@/components/page-list';
import { StyledWrapper } from './all';
import { FavouritesIcon } from '@blocksuite/icons';

export const Favorite = () => {
  const { pageList: allPageList } = useEditor();
  return (
    <>
      <Header>
        <StyledWrapper>
          <FavouritesIcon />
          Favorites
        </StyledWrapper>
      </Header>
      <PageList pageList={allPageList.filter(p => p.favorite && !p.trash)} />
    </>
  );
};

export default Favorite;
