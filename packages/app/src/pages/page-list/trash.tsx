import { PageListHeader } from '@/components/header';
import { useEditor } from '@/providers/editor-provider';
import { PageList } from '@/components/page-list';
import { TrashIcon } from '@blocksuite/icons';
export const Trash = () => {
  const { pageList: allPageList } = useEditor();
  return (
    <>
      <PageListHeader icon={<TrashIcon />}>Trash</PageListHeader>
      <PageList pageList={allPageList.filter(p => p.trash)} isTrash={true} />
    </>
  );
};

export default Trash;
