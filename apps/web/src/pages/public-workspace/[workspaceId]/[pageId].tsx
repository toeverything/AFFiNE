import { Breadcrumbs, displayFlex, styled } from '@affine/component';
import { initPage } from '@affine/env/blocksuite';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { PageIcon } from '@blocksuite/icons';
import { assertExists } from '@blocksuite/store';
import { useBlockSuiteWorkspaceAvatarUrl } from '@toeverything/hooks/use-block-suite-workspace-avatar-url';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import { useAtom, useAtomValue } from 'jotai';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { ReactElement } from 'react';
import { Suspense, useCallback, useEffect } from 'react';

import {
  publicPageBlockSuiteAtom,
  publicWorkspaceIdAtom,
  publicWorkspacePageIdAtom,
} from '../../../atoms/public-workspace';
import { PageDetailEditor } from '../../../components/page-detail-editor';
import { WorkspaceAvatar } from '../../../components/pure/footer';
import { PageLoading } from '../../../components/pure/loading';
import { useReferenceLinkEffect } from '../../../hooks/affine/use-reference-link-effect';
import { useRouterHelper } from '../../../hooks/use-router-helper';
import {
  PublicQuickSearch,
  PublicWorkspaceLayout,
} from '../../../layouts/public-workspace-layout';
import type { NextPageWithLayout } from '../../../shared';

export const NavContainer = styled('div')(() => {
  return {
    width: '100vw',
    height: '52px',
    ...displayFlex('space-between', 'center'),
    backgroundColor: 'var(--affine-background-primary-color)',
  };
});

export const StyledBreadcrumbs = styled(Link)(() => {
  return {
    flex: 1,
    ...displayFlex('center', 'center'),
    paddingLeft: '12px',
    span: {
      padding: '0 12px',
      fontSize: 'var(--affine-font-base)',
      lineHeight: 'var(--affine-line-height)',
    },
    ':hover': { color: 'var(--affine-primary-color)' },
    transition: 'all .15s',
    ':visited': {
      ':hover': { color: 'var(--affine-primary-color)' },
    },
  };
});

const PublicWorkspaceDetailPageInner = (): ReactElement => {
  const pageId = useAtomValue(publicWorkspacePageIdAtom);
  assertExists(pageId, 'pageId is null');
  const publicWorkspace = useAtomValue(publicPageBlockSuiteAtom);
  const blockSuiteWorkspace = publicWorkspace.blockSuiteWorkspace;
  if (!blockSuiteWorkspace) {
    throw new Error('cannot find workspace');
  }
  const router = useRouter();
  const { openPage } = useRouterHelper(router);
  useReferenceLinkEffect({
    pageLinkClicked: useCallback(
      ({ pageId }: { pageId: string }) => {
        return openPage(blockSuiteWorkspace.id, pageId);
      },
      [blockSuiteWorkspace.id, openPage]
    ),
  });
  const t = useAFFiNEI18N();
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
                <span>{pageTitle ? pageTitle : t['Untitled']()}</span>
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
  const [workspaceId, setWorkspaceId] = useAtom(publicWorkspaceIdAtom);
  const [pageId, setPageId] = useAtom(publicWorkspacePageIdAtom);
  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    if (typeof router.query.workspaceId === 'string') {
      setWorkspaceId(router.query.workspaceId);
    }
    if (typeof router.query.pageId === 'string') {
      setPageId(router.query.pageId);
    }
  }, [
    router.isReady,
    router.query.pageId,
    router.query.workspaceId,
    setPageId,
    setWorkspaceId,
  ]);
  if (!router.isReady || !workspaceId || !pageId) {
    return <PageLoading />;
  }
  return (
    <Suspense fallback={<PageLoading />}>
      <PublicWorkspaceDetailPageInner />
    </Suspense>
  );
};

export default PublicWorkspaceDetailPage;

PublicWorkspaceDetailPage.getLayout = page => {
  return <PublicWorkspaceLayout>{page}</PublicWorkspaceLayout>;
};
