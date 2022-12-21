import { useLoadWorkspace } from '@/providers/app-state-provider/hooks';
import { PageList } from '@/components/page-list';
import { AllPagesIcon } from '@blocksuite/icons';
import usePageMetaList from '@/hooks/use-page-meta-list';
import { PageListHeader } from '@/components/header';

const All = () => {
  const workspace = useLoadWorkspace();
  const pageMetaList = usePageMetaList();

  return workspace ? (
    <>
      <PageListHeader icon={<AllPagesIcon />}>All Page</PageListHeader>
      <PageList
        pageList={pageMetaList.filter(p => !p.trash)}
        showFavoriteTag={true}
      />
    </>
  ) : null;
};

export default All;
