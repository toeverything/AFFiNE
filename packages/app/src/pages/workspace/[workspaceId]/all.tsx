import { usePageList } from '@/providers/app-state-provider/usePageList';
import { useLoadWorkspace } from '@/providers/app-state-provider/hooks';
import { PageList } from '@/components/page-list';
import { AllPagesIcon } from '@blocksuite/icons';

import { PageListHeader } from '@/components/header';

const All = () => {
  const workspace = useLoadWorkspace();
  const allPageList = usePageList(workspace);
  return workspace ? (
    <>
      <PageListHeader icon={<AllPagesIcon />}>All Page</PageListHeader>
      <PageList
        pageList={allPageList.filter(p => !p.trash)}
        showFavoriteTag={true}
      />
    </>
  ) : null;
};

export default All;
