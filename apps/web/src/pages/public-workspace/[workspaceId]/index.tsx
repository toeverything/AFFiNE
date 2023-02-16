import { PageList } from '@/components/page-list';
import { WorkspaceUnitAvatar } from '@/components/workspace-avatar';
import { useLoadPublicWorkspace } from '@/hooks/use-load-public-workspace';
import { PageMeta } from '@/providers/app-state-provider';
import { useModal } from '@/store/globalModal';
import { Breadcrumbs } from '@affine/component';
import { SearchIcon } from '@blocksuite/icons';
import { useRouter } from 'next/router';
import { ReactElement, useMemo, useEffect } from 'react';
import {
  NavContainer,
  PageContainer,
  SearchButton,
  StyledBreadcrumbs,
} from './[pageId]';
import { PageLoading } from '@/components/loading';

const All = () => {
  const router = useRouter();
  const { triggerQuickSearchModal } = useModal();
  const workspaceId = router.query.workspaceId;
  if (typeof workspaceId !== 'string') {
    throw router.push('/404');
  }

  const { isLoading, workspace } = useLoadPublicWorkspace(workspaceId);

  const pageList = useMemo(() => {
    return (workspace?.blocksuiteWorkspace?.meta.pageMetas ?? []) as PageMeta[];
  }, [workspace]);

  const workspaceName = workspace?.blocksuiteWorkspace?.meta.name;

  if (isLoading) {
    return <PageLoading />;
  }

  return (
    <PageContainer>
      <NavContainer>
        <Breadcrumbs>
          <StyledBreadcrumbs
            href={`/public-workspace/${router.query.workspaceId}`}
          >
            <WorkspaceUnitAvatar
              size={24}
              name={workspaceName}
              workspaceUnit={workspace}
            />
            <span>{workspaceName}</span>
          </StyledBreadcrumbs>
        </Breadcrumbs>
        <SearchButton
          onClick={() => {
            triggerQuickSearchModal();
          }}
        >
          <SearchIcon />
        </SearchButton>
      </NavContainer>
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
