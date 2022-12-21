import { useLoadWorkspace } from '@/providers/app-state-provider/hooks';
import { PageListHeader } from '@/components/header';
import { PageList } from '@/components/page-list';
import { TrashIcon } from '@blocksuite/icons';
import usePageMetaList from '@/hooks/use-page-meta-list';
import { NextPageWithLayout } from '@/pages/_app';
import { ReactElement } from 'react';
import WorkspaceLayout from '@/components/workspace-layout';

export const Trash: NextPageWithLayout = () => {
  const workspace = useLoadWorkspace();
  const pageMetaList = usePageMetaList();
  return workspace ? (
    <>
      <PageListHeader icon={<TrashIcon />}>Trash</PageListHeader>
      <PageList pageList={pageMetaList.filter(p => p.trash)} isTrash={true} />
    </>
  ) : null;
};

Trash.getLayout = function getLayout(page: ReactElement) {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};

export default Trash;
