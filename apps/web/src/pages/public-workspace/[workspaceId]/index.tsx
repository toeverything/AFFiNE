import { PageList } from '@/components/page-list';
import { ReactElement, useEffect, useMemo, useState } from 'react';
import { PageMeta, useAppState } from '@/providers/app-state-provider';
import { useRouter } from 'next/router';
import {
  PageContainer,
  NavContainer,
  StyledBreadcrumbs,
  SearchButton,
} from './[pageId]';
import { Breadcrumbs } from '@affine/component';
import { WorkspaceUnitAvatar } from '@/components/workspace-avatar';
import { SearchIcon } from '@blocksuite/icons';
import { useModal } from '@/store/globalModal';
import { WorkspaceUnit } from '@affine/datacenter';
const All = () => {
  const { dataCenter } = useAppState();
  const router = useRouter();
  const { triggerQuickSearchModal } = useModal();
  const [workspace, setWorkspace] = useState<WorkspaceUnit>();

  const pageList = useMemo(() => {
    return (workspace?.blocksuiteWorkspace?.meta.pageMetas ?? []) as PageMeta[];
  }, [workspace]);

  const workspaceName = workspace?.blocksuiteWorkspace?.meta.name;

  useEffect(() => {
    const workspaceId = router.query.workspaceId as string;
    if (workspaceId) {
      dataCenter
        .loadPublicWorkspace(router.query.workspaceId as string)
        .then(data => {
          if (workspaceId === router.query.workspaceId) {
            setWorkspace(data);
          }
        })
        .catch(() => {
          if (workspaceId === router.query.workspaceId) {
            router.push('/404');
          }
        });
    }
  }, [router, router.query, dataCenter]);

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
