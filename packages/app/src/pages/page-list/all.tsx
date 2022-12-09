import { Header } from '@/components/header';
import { useEditor } from '@/providers/editor-provider';
import { PageList } from '@/components/page-list';

export const All = () => {
  const { pageList: allPageList } = useEditor();
  return (
    <>
      <Header />
      <PageList
        pageList={allPageList.filter(p => !p.trash)}
        showFavoriteTag={true}
      />
    </>
  );
};

export default All;
