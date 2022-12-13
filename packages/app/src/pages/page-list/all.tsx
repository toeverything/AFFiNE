import { Header } from '@/components/header';
import { useEditor } from '@/providers/editor-provider';
import { PageList } from '@/components/page-list';
import { AllPagesIcon } from '@blocksuite/icons';

import { HeaderWrapper } from '@/components/header';
import { styled } from '@/styles';

export const StyledWrapper = styled(HeaderWrapper)(({ theme }) => {
  return {
    fontSize: theme.font.sm,
    color: theme.colors.textColor,
    '>svg': {
      fontSize: '20px',
      marginRight: '12px',
    },
  };
});

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
