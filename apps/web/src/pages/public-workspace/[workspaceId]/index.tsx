import { Breadcrumbs } from '@affine/component';
import { PageMeta } from '@affine/store';
import { SearchIcon } from '@blocksuite/icons';
import { useRouter } from 'next/router';
import { ReactElement, useEffect, useMemo } from 'react';

import { PageLoading } from '@/components/loading';
import { PageList } from '@/components/page-list';
import { WorkspaceUnitAvatar } from '@/components/workspace-avatar';
import { useLoadPublicWorkspace } from '@/hooks/use-load-public-workspace';
import { useModal } from '@/store/globalModal';

import {
  NavContainer,
  PageContainer,
  SearchButton,
  StyledBreadcrumbs,
} from './[pageId]';

const All = () => {
  const router = useRouter();
  const { triggerQuickSearchModal } = useModal();
  const { status, workspace } = useLoadPublicWorkspace(
    router.query.workspaceId as string
  );

  const pageList = useMemo(() => {
    return (workspace?.blocksuiteWorkspace?.meta.pageMetas ?? []) as PageMeta[];
  }, [workspace]);

  const workspaceName = workspace?.blocksuiteWorkspace?.meta.name;

  useEffect(() => {
    if (status === 'error') {
      router.push('/404');
    }
  }, [router, status]);

  if (status === 'loading') {
    return <PageLoading />;
  }

  if (status === 'error') {
    return null;
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
