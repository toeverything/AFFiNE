import { Breadcrumbs } from '@affine/component';
import { PageMeta, useDataCenterPublicWorkspace } from '@affine/store';
import { SearchIcon } from '@blocksuite/icons';
import { useRouter } from 'next/router';
import { ReactElement, useEffect, useMemo } from 'react';

import { PageLoading } from '@/components/loading';
import { PageList } from '@/components/page-list';
import { WorkspaceUnitAvatar } from '@/components/workspace-avatar';
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
  const { workspace, error } = useDataCenterPublicWorkspace(
    typeof router.query.workspaceId === 'string'
      ? router.query.workspaceId
      : null
  );

  const pageList = useMemo(() => {
    return (workspace?.blocksuiteWorkspace?.meta.pageMetas ?? []) as PageMeta[];
  }, [workspace]);

  const workspaceName = workspace?.blocksuiteWorkspace?.meta.name;

  useEffect(() => {
    if (error) {
      router.push('/404');
    }
  }, [router, error]);

  if (!workspace) {
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
