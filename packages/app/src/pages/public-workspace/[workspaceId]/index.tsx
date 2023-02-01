import { PageList } from '@/components/page-list';
import { ReactElement, useEffect, useState } from 'react';
import { PageMeta, useAppState } from '@/providers/app-state-provider';
import { useRouter } from 'next/router';
import {
  PageContainer,
  NavContainer,
  StyledBreadcrumbs,
  SearchButton,
} from './[pageId]';
import { Breadcrumbs } from '@/ui/breadcrumbs';
import { WorkspaceUnitAvatar } from '@/components/workspace-avatar';
import { SearchIcon } from '@blocksuite/icons';
import { useModal } from '@/providers/GlobalModalProvider';
const All = () => {
  const { dataCenter } = useAppState();
  const router = useRouter();
  const [pageList, setPageList] = useState<PageMeta[]>([]);
  const [workspaceName, setWorkspaceName] = useState('');
  const { triggerQuickSearchModal } = useModal();
  useEffect(() => {
    dataCenter
      .loadPublicWorkspace(router.query.workspaceId as string)
      .then(data => {
        setPageList(data.blocksuiteWorkspace?.meta.pageMetas as PageMeta[]);
        setWorkspaceName(data.blocksuiteWorkspace?.meta.name as string);
      })
      .catch(() => {
        router.push('/404');
      });
  }, [router, dataCenter]);

  return (
    <PageContainer>
      <NavContainer>
        <Breadcrumbs>
          <StyledBreadcrumbs
            href={`/public-workspace/${router.query.workspaceId}`}
          >
            <WorkspaceUnitAvatar size={24} name={workspaceName} />
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
