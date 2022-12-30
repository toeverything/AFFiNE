import { PageList } from '@/components/page-list';
import { AllPagesIcon } from '@blocksuite/icons';
import usePageMetaList from '@/hooks/use-page-meta-list';
import { PageListHeader } from '@/components/header';
import { ReactElement } from 'react';
import WorkspaceLayout from '@/components/workspace-layout';

const All = () => {
  const pageMetaList = usePageMetaList();

  return (
    <>
      <PageListHeader icon={<AllPagesIcon />}>All Page</PageListHeader>
      <PageList
        pageList={pageMetaList.filter(p => !p.trash)}
        showFavoriteTag={true}
      />
    </>
  );
};

All.getLayout = function getLayout(page: ReactElement) {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};

export default All;
