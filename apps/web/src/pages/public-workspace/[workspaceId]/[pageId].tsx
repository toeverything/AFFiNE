import { Breadcrumbs, displayFlex, styled } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { PageIcon } from '@blocksuite/icons';
import { assertExists } from '@blocksuite/store';
import { useBlockSuiteWorkspaceAvatarUrl } from '@toeverything/hooks/use-blocksuite-workspace-avatar-url';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-blocksuite-workspace-name';
import { useAtomValue, useSetAtom } from 'jotai';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type React from 'react';
import { Suspense, useCallback, useEffect } from 'react';

import {
  publicPageBlockSuiteAtom,
  publicWorkspaceIdAtom,
  publicWorkspacePageIdAtom,
} from '../../../atoms/public-workspace';
import { QueryParamError } from '../../../components/affine/affine-error-eoundary';
import { PageDetailEditor } from '../../../components/page-detail-editor';
import { WorkspaceAvatar } from '../../../components/pure/footer';
import { PageLoading } from '../../../components/pure/loading';
import { useReferenceLink } from '../../../hooks/affine/use-reference-link';
import { useRouterHelper } from '../../../hooks/use-router-helper';
import {
  PublicQuickSearch,
  PublicWorkspaceLayout,
} from '../../../layouts/public-workspace-layout';
import type { NextPageWithLayout } from '../../../shared';
import { initPage } from '../../../utils';

export const NavContainer = styled('div')(({ theme }) => {
  return {
    width: '100vw',
    height: '52px',
    ...displayFlex('space-between', 'center'),
    backgroundColor: theme.colors.pageBackground,
  };
});

export const StyledBreadcrumbs = styled(Link)(({ theme }) => {
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
      ':hover': { color: theme.colors.primaryColor },
    },
  };
});

const PublicWorkspaceDetailPageInner: React.FC<{
  pageId: string;
}> = ({ pageId }) => {
  const publicWorkspace = useAtomValue(publicPageBlockSuiteAtom);
  const blockSuiteWorkspace = publicWorkspace.blockSuiteWorkspace;
  if (!blockSuiteWorkspace) {
    throw new Error('cannot find workspace');
  }
  const router = useRouter();
  const { openPage } = useRouterHelper(router);
  useReferenceLink({
    pageLinkClicked: useCallback(
      ({ pageId }: { pageId: string }) => {
        assertExists(currentWorkspace);
        return openPage(blockSuiteWorkspace.id, pageId);
      },
      [blockSuiteWorkspace.id, openPage]
    ),
  });
  const { t } = useTranslation();
  const [name] = useBlockSuiteWorkspaceName(blockSuiteWorkspace);
  const [avatar] = useBlockSuiteWorkspaceAvatarUrl(blockSuiteWorkspace);
  const pageTitle = blockSuiteWorkspace.meta.getPageMeta(pageId)?.title;
  return (
    <>
      <PublicQuickSearch workspace={publicWorkspace} />
      <PageDetailEditor
        isPublic={true}
        pageId={pageId}
        workspace={publicWorkspace}
        onLoad={(_, editor) => {
          const { page } = editor;
          page.awarenessStore.setReadonly(page, true);
        }}
        onInit={initPage}
        header={
          <NavContainer>
            <Breadcrumbs>
              <StyledBreadcrumbs
                href={`/public-workspace/${blockSuiteWorkspace.id}`}
              >
                <WorkspaceAvatar size={24} name={name} avatar={avatar} />
                <span>{name}</span>
              </StyledBreadcrumbs>
              <StyledBreadcrumbs
                href={`/public-workspace/${blockSuiteWorkspace.id}/${pageId}`}
              >
                <PageIcon fontSize={24} />
                <span>{pageTitle ? pageTitle : t('Untitled')}</span>
              </StyledBreadcrumbs>
            </Breadcrumbs>
          </NavContainer>
        }
      />
    </>
  );
};

export const PublicWorkspaceDetailPage: NextPageWithLayout = () => {
  const router = useRouter();
  const workspaceId = router.query.workspaceId;
  const pageId = router.query.pageId;
  const setWorkspaceId = useSetAtom(publicWorkspaceIdAtom);
  const setPageId = useSetAtom(publicWorkspacePageIdAtom);
  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    if (typeof workspaceId === 'string') {
      setWorkspaceId(workspaceId);
    }
    if (typeof pageId === 'string') {
      setPageId(pageId);
    }
  }, [pageId, router.isReady, setPageId, setWorkspaceId, workspaceId]);
  const value = useAtomValue(publicWorkspaceIdAtom);
  if (!router.isReady || !value) {
    return <PageLoading />;
  }
  if (typeof workspaceId !== 'string' || typeof pageId !== 'string') {
    throw new QueryParamError('workspaceId, pageId', workspaceId);
  }
  return (
    <Suspense fallback={<PageLoading />}>
      <PublicWorkspaceDetailPageInner pageId={pageId} />
    </Suspense>
  );
};

export default PublicWorkspaceDetailPage;

PublicWorkspaceDetailPage.getLayout = page => {
  return <PublicWorkspaceLayout>{page}</PublicWorkspaceLayout>;
};
