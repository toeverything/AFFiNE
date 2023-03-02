import { ListSkeleton } from '@affine/component';
import { useAtomValue, useSetAtom } from 'jotai';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import React, { Suspense, useCallback, useEffect } from 'react';

import { currentWorkspaceIdAtom } from '../../atoms';
import {
  publicBlockSuiteAtom,
  publicWorkspaceIdAtom,
} from '../../atoms/public-workspace';
import { QueryParamError } from '../../components/affine/affine-error-eoundary';
import { StyledTableContainer } from '../../components/blocksuite/block-suite-page-list/page-list/styles';
import { PageLoading } from '../../components/pure/loading';
import { WorkspaceLayout } from '../../layouts';
import { NextPageWithLayout } from '../../shared';

const BlockSuitePublicPageList = dynamic(
  async () =>
    (await import('../../components/blocksuite/block-suite-page-list'))
      .BlockSuitePublicPageList
);

const ListPageInner: React.FC<{
  workspaceId: string;
}> = ({ workspaceId }) => {
  const router = useRouter();
  const blockSuiteWorkspace = useAtomValue(publicBlockSuiteAtom);
  const handleClickPage = useCallback(
    (pageId: string) => {
      return router.push({
        pathname: `/public-workspace/[workspaceId]/[pageId]`,
        query: {
          workspaceId,
          pageId,
        },
      });
    },
    [router, workspaceId]
  );
  if (!blockSuiteWorkspace) {
    return <PageLoading />;
  }
  return (
    <BlockSuitePublicPageList
      onOpenPage={handleClickPage}
      blockSuiteWorkspace={blockSuiteWorkspace}
    />
  );
};

// This is affine only page, so we don't need to dynamic use WorkspacePlugin
const ListPage: NextPageWithLayout = () => {
  const router = useRouter();
  const workspaceId = router.query.workspaceId;
  const setWorkspaceId = useSetAtom(publicWorkspaceIdAtom);
  const setCurrentWorkspaceId = useSetAtom(currentWorkspaceIdAtom);
  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    if (typeof workspaceId === 'string') {
      setWorkspaceId(workspaceId);
      setCurrentWorkspaceId(workspaceId);
    }
  }, [router.isReady, setCurrentWorkspaceId, setWorkspaceId, workspaceId]);
  const value = useAtomValue(publicWorkspaceIdAtom);
  if (!router.isReady || !value) {
    return <PageLoading />;
  }
  if (typeof workspaceId !== 'string') {
    throw new QueryParamError('workspaceId', workspaceId);
  }
  return (
    <Suspense
      fallback={
        <StyledTableContainer>
          <ListSkeleton />
        </StyledTableContainer>
      }
    >
      <ListPageInner workspaceId={workspaceId} />
    </Suspense>
  );
};

export default ListPage;

ListPage.getLayout = page => {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
