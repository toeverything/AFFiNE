import { useLoadWorkspace } from '@/providers/app-state-provider/hooks';
import { PageList } from '@/components/page-list';
import { AllPagesIcon } from '@blocksuite/icons';
import usePageMetaList from '@/hooks/use-page-meta-list';
import { PageListHeader } from '@/components/header';
import { NextPageWithLayout } from '@/pages/_app';
import { ReactElement } from 'react';
import WorkspaceLayout from '@/components/workspace-layout';

const All: NextPageWithLayout = () => {
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

All.getLayout = function getLayout(page: ReactElement) {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};

export default All;
