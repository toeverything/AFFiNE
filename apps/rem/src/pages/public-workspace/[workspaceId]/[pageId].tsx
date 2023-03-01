import {
  Breadcrumbs,
  displayFlex,
  IconButton,
  styled,
} from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { PaperIcon } from '@blocksuite/icons';
import { useAtomValue, useSetAtom } from 'jotai';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { Suspense, useEffect } from 'react';

import {
  publicBlockSuiteAtom,
  publicWorkspaceIdAtom,
} from '../../../atoms/public-workspace';
import { QueryParamError } from '../../../components/affine/affine-error-eoundary';
import { PageDetailEditor } from '../../../components/page-detail-editor';
import { WorkspaceAvatar } from '../../../components/pure/footer';
import { PageLoading } from '../../../components/pure/loading';
import { WorkspaceLayout } from '../../../layouts';
import { NextPageWithLayout } from '../../../shared';

export const NavContainer = styled.div(({ theme }) => {
  return {
    width: '100vw',
    padding: '0 12px',
    height: '60px',
    ...displayFlex('start', 'center'),
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

const PublicWorkspaceDetailPageInner: React.FC<{
  pageId: string;
}> = ({ pageId }) => {
  const blockSuiteWorkspace = useAtomValue(publicBlockSuiteAtom);
  if (!blockSuiteWorkspace) {
    throw new Error('cannot find workspace');
  }
  const { t } = useTranslation();
  const name = blockSuiteWorkspace.meta.name;
  const pageTitle = blockSuiteWorkspace.meta.getPageMeta(pageId)?.title;
  return (
    <>
      <PageDetailEditor
        pageId={pageId}
        blockSuiteWorkspace={blockSuiteWorkspace}
        onLoad={(_, editor) => {
          editor.readonly = true;
        }}
        header={
          <NavContainer
            // fixme(himself65): this is a hack to make the breadcrumbs work
            style={{
              position: 'absolute',
              left: '0',
            }}
          >
            <Breadcrumbs>
              <StyledBreadcrumbs
                href={`/public-workspace/${blockSuiteWorkspace.room}`}
              >
                <WorkspaceAvatar
                  size={24}
                  name={name}
                  avatar={blockSuiteWorkspace.meta.avatar}
                />
                <span>{name}</span>
              </StyledBreadcrumbs>
              <StyledBreadcrumbs
                href={`/public-workspace/${
                  blockSuiteWorkspace.room as string
                }/${pageId}`}
              >
                <PaperIcon fontSize={24} />
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
  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    if (typeof workspaceId === 'string') {
      setWorkspaceId(workspaceId);
    }
  }, [router.isReady, setWorkspaceId, workspaceId]);
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
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
