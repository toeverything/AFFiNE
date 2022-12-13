import { Header } from '@/components/header';
import { useEditor } from '@/providers/editor-provider';
import { PageList } from '@/components/page-list';
import { StyledWrapper } from '@/pages/page-list/styles';
import { AllPagesIcon } from '@blocksuite/icons';

export const All = () => {
  const { pageList: allPageList } = useEditor();
  return (
    <>
      <Header>
        <StyledWrapper>
          <AllPagesIcon />
          All Pages
        </StyledWrapper>
      </Header>
      <PageList
        pageList={allPageList.filter(p => !p.trash)}
        showFavoriteTag={true}
      />
    </>
  );
};

export default All;
