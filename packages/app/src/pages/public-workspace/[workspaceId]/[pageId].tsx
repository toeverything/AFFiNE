import { ReactElement, useEffect, useState } from 'react';
import { useAppState } from '@/providers/app-state-provider';
import type { NextPageWithLayout } from '../..//_app';
import { styled } from '@/styles';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { Page as PageStore, Workspace } from '@blocksuite/store';
import { PageLoading } from '@/components/loading';

import { useTranslation } from '@affine/i18n';

const DynamicBlocksuite = dynamic(() => import('@/components/editor'), {
  ssr: false,
});
const Page: NextPageWithLayout = () => {
  const [workspace, setWorkspace] = useState<Workspace>();
  const [page, setPage] = useState<PageStore>();
  const { dataCenter } = useAppState();
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const { t } = useTranslation();
  useEffect(() => {
    dataCenter
      .loadPublicWorkspace(router.query.workspaceId as string)
      .then(data => {
        if (data && data.blocksuiteWorkspace) {
          setWorkspace(data.blocksuiteWorkspace);
          if (
            router.query.pageId &&
            data.blocksuiteWorkspace.meta.pageMetas.find(
              p => p.id === router.query.pageId
            )
          ) {
            const page = data.blocksuiteWorkspace.getPage(
              router.query.pageId as string
            );
            page && setPage(page);
          } else {
            router.push('/404');
          }
        }
      })
      .catch(() => {
        router.push('/404');
      });
  }, [router, dataCenter]);
  return (
    <>
      {!loaded && <PageLoading />}
      <PageContainer>
        {workspace && page && (
          <DynamicBlocksuite
            page={page}
            workspace={workspace}
            setEditor={editor => {
              editor.readonly = true;
              setLoaded(true);
            }}
          />
        )}
      </PageContainer>
    </>
  );
};

Page.getLayout = function getLayout(page: ReactElement) {
  return <div>{page}</div>;
};

export default Page;

export const PageContainer = styled.div(({ theme }) => {
  return {
    height: 'calc(100vh)',
    padding: '78px 72px',
    overflowY: 'auto',
    backgroundColor: theme.colors.pageBackground,
  };
});
