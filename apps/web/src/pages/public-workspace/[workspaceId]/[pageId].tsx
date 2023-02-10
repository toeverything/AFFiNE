import { ReactElement, useEffect, useState } from 'react';
import { useAppState } from '@/providers/app-state-provider';
import type { NextPageWithLayout } from '../..//_app';
import { displayFlex, styled } from '@affine/component';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { Page as PageStore, Workspace } from '@blocksuite/store';
import { PageLoading } from '@/components/loading';
import { Breadcrumbs } from '@affine/component';
import { IconButton } from '@affine/component';
import NextLink from 'next/link';
import { PaperIcon, SearchIcon } from '@blocksuite/icons';
import { WorkspaceUnitAvatar } from '@/components/workspace-avatar';
import { useModal } from '@/store/globalModal';

const DynamicBlocksuite = dynamic(() => import('@/components/editor'), {
  ssr: false,
});
const Page: NextPageWithLayout = () => {
  const [workspace, setWorkspace] = useState<Workspace>();
  const [page, setPage] = useState<PageStore>();
  const { dataCenter } = useAppState();
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [pageTitle, setPageTitle] = useState('');
  const { triggerQuickSearchModal } = useModal();

  useEffect(() => {
    dataCenter
      .loadPublicWorkspace(router.query.workspaceId as string)
      .then(data => {
        setWorkspaceName(data.blocksuiteWorkspace?.meta.name as string);
        if (data.blocksuiteWorkspace) {
          setWorkspace(data.blocksuiteWorkspace);
          if (
            router.query.pageId &&
            data.blocksuiteWorkspace.meta.pageMetas.find(
              p => p.id === router.query.pageId
            )
          ) {
            const page = data.blocksuiteWorkspace.getPage(
              router.query.pageId as string
            );
            page && setPageTitle(page.meta.title);
            page && setPage(page);
          } else {
            router.push('/404');
          }
        }
      })
      .catch(() => {
        router.push('/404');
      });
  }, [router, dataCenter]);
  return (
    <>
      {!loaded && <PageLoading />}
      <PageContainer>
        <NavContainer>
          <Breadcrumbs>
            <StyledBreadcrumbs
              href={`/public-workspace/${router.query.workspaceId}`}
            >
              <WorkspaceUnitAvatar size={24} name={workspaceName} />
              <span>{workspaceName}</span>
            </StyledBreadcrumbs>
            <StyledBreadcrumbs
              href={`/public-workspace/${router.query.workspaceId}/${router.query.pageId}`}
            >
              <PaperIcon fontSize={24} />
              <span>{pageTitle ? pageTitle : 'Untitled'}</span>
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

        {workspace && page && (
          <DynamicBlocksuite
            page={page}
            workspace={workspace}
            setEditor={editor => {
              editor.readonly = true;
              setLoaded(true);
            }}
          />
        )}
      </PageContainer>
    </>
  );
};

Page.getLayout = function getLayout(page: ReactElement) {
  return <div>{page}</div>;
};

export default Page;

export const PageContainer = styled.div(({ theme }) => {
  return {
    height: '100vh',
    overflowY: 'auto',
    backgroundColor: theme.colors.pageBackground,
  };
});
export const NavContainer = styled.div(({ theme }) => {
  return {
    width: '100vw',
    padding: '0 12px',
    height: '60px',
    ...displayFlex('start', 'center'),
    backgroundColor: theme.colors.pageBackground,
  };
});
export const StyledBreadcrumbs = styled(NextLink)(({ theme }) => {
  return {
    flex: 1,
    ...displayFlex('center', 'center'),
    paddingLeft: '12px',
    span: {
      padding: '0 12px',
      fontSize: theme.font.base,
      lineHeight: theme.font.lineHeight,
    },
    ':hover': { color: theme.colors.primaryColor },
    transition: 'all .15s',
    ':visited': {
      color: theme.colors.popoverColor,
      ':hover': { color: theme.colors.primaryColor },
    },
  };
});
export const SearchButton = styled(IconButton)(({ theme }) => {
  return {
    color: theme.colors.iconColor,
    fontSize: '24px',
    marginLeft: 'auto',
    padding: '0 24px',
  };
});
