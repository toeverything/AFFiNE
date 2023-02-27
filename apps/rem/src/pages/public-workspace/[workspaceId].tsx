import { useAtomValue, useSetAtom } from 'jotai';
import { useRouter } from 'next/router';
import React, { Suspense, useCallback, useEffect } from 'react';

import {
  publicBlockSuiteAtom,
  publicWorkspaceIdAtom,
} from '../../atoms/public-workspace';
import { QueryParamError } from '../../components/affine/affine-error-eoundary';
import { BlockSuitePublicPageList } from '../../components/blocksuite/block-suite-page-list';
import { PageLoading } from '../../components/pure/loading';
import { WorkspaceLayout } from '../../layouts';
import { WorkspacePlugins } from '../../plugins';
import { NextPageWithLayout, RemWorkspaceFlavour } from '../../shared';

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
  const PageList = WorkspacePlugins[RemWorkspaceFlavour.AFFINE].PageList;
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

const ListPage: NextPageWithLayout = () => {
  const router = useRouter();
  const workspaceId = router.query.workspaceId;
  const setWorkspaceId = useSetAtom(publicWorkspaceIdAtom);
  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    if (typeof workspaceId === 'string') {
      setWorkspaceId(workspaceId);
    }
  }, [router.isReady, setWorkspaceId, workspaceId]);
  const value = useAtomValue(publicWorkspaceIdAtom);
  if (!router.isReady || !value) {
    return <PageLoading />;
  }
  if (typeof workspaceId !== 'string') {
    throw new QueryParamError('workspaceId', workspaceId);
  }
  return (
    <Suspense fallback={<PageLoading />}>
      <ListPageInner workspaceId={workspaceId} />
    </Suspense>
  );
};

export default ListPage;

ListPage.getLayout = page => {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
