import { PageList } from '@/components/page-list';
import { WorkspaceUnitAvatar } from '@/components/workspace-avatar';
import { usePublicWorkspace } from '@/hooks/use-public-workspace';
import { PageMeta } from '@/providers/app-state-provider';
import { useModal } from '@/store/globalModal';
import { Breadcrumbs } from '@affine/component';
import { SearchIcon } from '@blocksuite/icons';
import { useRouter } from 'next/router';
import { ReactElement, useMemo } from 'react';
import {
  NavContainer,
  PageContainer,
  SearchButton,
  StyledBreadcrumbs,
} from './[pageId]';

const All = () => {
  const router = useRouter();
  const { triggerQuickSearchModal } = useModal();
  const workspaceUnit = usePublicWorkspace(router.query.workspaceId as string);

  const pageList = useMemo(() => {
    return (workspaceUnit?.blocksuiteWorkspace?.meta.pageMetas ??
      []) as PageMeta[];
  }, [workspaceUnit]);

  const workspaceName = workspaceUnit?.blocksuiteWorkspace?.meta.name;
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
              workspaceUnit={workspaceUnit}
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
