import { Breadcrumbs, IconButton, ListSkeleton } from '@affine/component';
import { SearchIcon } from '@blocksuite/icons';
import { useBlockSuiteWorkspaceAvatarUrl } from '@toeverything/hooks/use-blocksuite-workspace-avatar-url';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-blocksuite-workspace-name';
import { useAtomValue, useSetAtom } from 'jotai';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import type React from 'react';
import { Suspense, useCallback, useEffect } from 'react';

import { currentWorkspaceIdAtom, openQuickSearchModalAtom } from '../../atoms';
import {
  publicWorkspaceAtom,
  publicWorkspaceIdAtom,
} from '../../atoms/public-workspace';
import { QueryParamError } from '../../components/affine/affine-error-eoundary';
import { StyledTableContainer } from '../../components/blocksuite/block-suite-page-list/page-list/styles';
import { WorkspaceAvatar } from '../../components/pure/footer';
import { PageLoading } from '../../components/pure/loading';
import { PublicWorkspaceLayout } from '../../layouts/public-workspace-layout';
import type { NextPageWithLayout } from '../../shared';
import { NavContainer, StyledBreadcrumbs } from './[workspaceId]/[pageId]';

const BlockSuitePublicPageList = dynamic(
  async () =>
    (await import('../../components/blocksuite/block-suite-page-list'))
      .BlockSuitePublicPageList
);

const ListPageInner: React.FC<{
  workspaceId: string;
}> = ({ workspaceId }) => {
  const router = useRouter();
  const publicWorkspace = useAtomValue(publicWorkspaceAtom);
  const blockSuiteWorkspace = publicWorkspace.blockSuiteWorkspace;
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
  useEffect(() => {
    blockSuiteWorkspace.awarenessStore.setFlag('enable_block_hub', false);
  }, [blockSuiteWorkspace]);
  const [name] = useBlockSuiteWorkspaceName(blockSuiteWorkspace);
  const [avatar] = useBlockSuiteWorkspaceAvatarUrl(blockSuiteWorkspace);
  const setSearchModalOpen = useSetAtom(openQuickSearchModalAtom);
  const handleOpen = useCallback(() => {
    setSearchModalOpen(true);
  }, [setSearchModalOpen]);
  if (!blockSuiteWorkspace) {
    return <PageLoading />;
  }
  return (
    <>
      <NavContainer sx={{ px: '20px' }}>
        <Breadcrumbs>
          <StyledBreadcrumbs
            href={`/public-workspace/${blockSuiteWorkspace.id}`}
          >
            <WorkspaceAvatar size={24} name={name} avatar={avatar} />
            <span>{name}</span>
          </StyledBreadcrumbs>
        </Breadcrumbs>
        <IconButton onClick={handleOpen}>
          <SearchIcon />
        </IconButton>
      </NavContainer>
      <BlockSuitePublicPageList
        onOpenPage={handleClickPage}
        blockSuiteWorkspace={blockSuiteWorkspace}
      />
    </>
  );
};

// This is affine only page, so we don't need to dynamic use WorkspacePlugin
const ListPage: NextPageWithLayout = () => {
  const router = useRouter();
  const workspaceId = router.query.workspaceId;
  const setWorkspaceId = useSetAtom(publicWorkspaceIdAtom);
  // todo: remove this atom usage here
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
  return <PublicWorkspaceLayout>{page}</PublicWorkspaceLayout>;
};
