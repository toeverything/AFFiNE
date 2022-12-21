import { useLoadWorkspace } from '@/providers/app-state-provider/hooks';
import { PageListHeader } from '@/components/header';
import { PageList } from '@/components/page-list';
import { TrashIcon } from '@blocksuite/icons';
import usePageMetaList from '@/hooks/use-page-meta-list';

export const Trash = () => {
  const workspace = useLoadWorkspace();
  const pageMetaList = usePageMetaList();
  return workspace ? (
    <>
      <PageListHeader icon={<TrashIcon />}>Trash</PageListHeader>
      <PageList pageList={pageMetaList.filter(p => p.trash)} isTrash={true} />
    </>
  ) : null;
};

export default Trash;
