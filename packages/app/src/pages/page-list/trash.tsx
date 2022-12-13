import { Header } from '@/components/header';
import { useEditor } from '@/providers/editor-provider';
import { PageList } from '@/components/page-list';
import { StyledWrapper } from './all';
import { TrashIcon } from '@blocksuite/icons';
export const Trash = () => {
  const { pageList: allPageList } = useEditor();
  return (
    <>
      <Header>
        <StyledWrapper>
          <TrashIcon />
          Trash
        </StyledWrapper>
      </Header>
      <PageList pageList={allPageList.filter(p => p.trash)} isTrash={true} />
    </>
  );
};

export default Trash;
