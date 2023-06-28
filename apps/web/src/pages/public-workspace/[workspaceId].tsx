import { Breadcrumbs, IconButton, ListSkeleton } from '@affine/component';
import { StyledTableContainer } from '@affine/component/page-list';
import { QueryParamError } from '@affine/env/constant';
import { rootCurrentWorkspaceIdAtom } from '@affine/workspace/atom';
import { SearchIcon } from '@blocksuite/icons';
import { useBlockSuiteWorkspaceAvatarUrl } from '@toeverything/hooks/use-block-suite-workspace-avatar-url';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import { useAtomValue, useSetAtom } from 'jotai';
import { useRouter } from 'next/router';
import type React from 'react';
import { lazy, Suspense, useCallback, useEffect } from 'react';

import { openQuickSearchModalAtom } from '../../atoms';
import {
  publicWorkspaceAtom,
  publicWorkspaceIdAtom,
} from '../../atoms/public-workspace';
import { WorkspaceAvatar } from '../../components/pure/footer';
import { PageLoading } from '../../components/pure/loading';
import {
  PublicQuickSearch,
  PublicWorkspaceLayout,
} from '../../layouts/public-workspace-layout';
import type { NextPageWithLayout } from '../../shared';
import { NavContainer, StyledBreadcrumbs } from './[workspaceId]/[pageId]';

const BlockSuitePageList = lazy(() =>
  import('../../components/blocksuite/block-suite-page-list').then(module => ({
    default: module.BlockSuitePageList,
  }))
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
      <PublicQuickSearch workspace={publicWorkspace} />
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
      <Suspense
        fallback={
          <StyledTableContainer>
            <ListSkeleton />
          </StyledTableContainer>
        }
      >
        <BlockSuitePageList
          listType="public"
          isPublic={true}
          onOpenPage={handleClickPage}
          blockSuiteWorkspace={blockSuiteWorkspace}
        />
      </Suspense>
    </>
  );
};

// This is affine only page, so we don't need to dynamic use WorkspacePlugin
const ListPage: NextPageWithLayout = () => {
  const router = useRouter();
  const workspaceId = router.query.workspaceId;
  const setWorkspaceId = useSetAtom(publicWorkspaceIdAtom);
  // todo: remove this atom usage here
  const setCurrentWorkspaceId = useSetAtom(rootCurrentWorkspaceIdAtom);
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
