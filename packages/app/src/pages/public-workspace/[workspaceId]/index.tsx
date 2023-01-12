import { PageList } from '@/components/page-list';
import { ReactElement, useEffect, useState } from 'react';
import { PageMeta, useAppState } from '@/providers/app-state-provider';
import { useRouter } from 'next/router';
import { PageContainer } from './[pageId]';
const All = () => {
  const { dataCenter } = useAppState();
  const router = useRouter();
  const [pageList, setPageList] = useState<PageMeta[]>([]);
  useEffect(() => {
    dataCenter
      .loadPublicWorkspace(router.query.workspaceId as string)
      .then(data => {
        setPageList(data.blocksuiteWorkspace?.meta.pageMetas as PageMeta[]);
      })
      .catch(() => {
        router.push('/404');
      });
  }, [router, dataCenter]);

  return (
    <PageContainer>
      <PageList
        pageList={pageList.filter(p => !p.trash)}
        showFavoriteTag={false}
        isPublic={true}
      />
    </PageContainer>
  );
};

All.getLayout = function getLayout(page: ReactElement) {
  return <div>{page}</div>;
};

export default All;
