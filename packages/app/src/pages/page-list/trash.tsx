import { Header } from '@/components/header';
import { useEditor } from '@/providers/editor-provider';
import { PageList } from '@/components/page-list';

export const Trash = () => {
  const { pageList: allPageList } = useEditor();
  return (
    <>
      <Header />
      <PageList pageList={allPageList.filter(p => p.trash)} isTrash={true} />
    </>
  );
};

export default Trash;
