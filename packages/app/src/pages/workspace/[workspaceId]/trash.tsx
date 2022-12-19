import { usePageList } from '@/providers/app-state-provider/usePageList';
import { useLoadWorkspace } from '@/providers/app-state-provider/hooks';
import { PageListHeader } from '@/components/header';
import { PageList } from '@/components/page-list';
import { TrashIcon } from '@blocksuite/icons';
export const Trash = () => {
  const workspace = useLoadWorkspace();
  const allPageList = usePageList(workspace);
  return workspace ? (
    <>
      <PageListHeader icon={<TrashIcon />}>Trash</PageListHeader>
      <PageList pageList={allPageList.filter(p => p.trash)} isTrash={true} />
    </>
  ) : null;
};

export default Trash;
