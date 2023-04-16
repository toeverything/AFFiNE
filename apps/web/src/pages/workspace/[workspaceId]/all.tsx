import { useTranslation } from '@affine/i18n';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { FolderIcon } from '@blocksuite/icons';
import { assertExists } from '@blocksuite/store';
import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useCallback } from 'react';

import {
  QueryParamError,
  Unreachable,
} from '../../../components/affine/affine-error-eoundary';
import { PageLoading } from '../../../components/pure/loading';
import { WorkspaceTitle } from '../../../components/pure/workspace-title';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useRouterHelper } from '../../../hooks/use-router-helper';
import { useSyncRouterWithCurrentWorkspaceId } from '../../../hooks/use-sync-router-with-current-workspace-id';
import { WorkspaceLayout } from '../../../layouts/workspace-layout';
import { WorkspacePlugins } from '../../../plugins';
import type { NextPageWithLayout } from '../../../shared';

const AllPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { jumpToPage } = useRouterHelper(router);
  const [currentWorkspace] = useCurrentWorkspace();
  const { t } = useTranslation();
  useSyncRouterWithCurrentWorkspaceId(router);
  const onClickPage = useCallback(
    (pageId: string, newTab?: boolean) => {
      assertExists(currentWorkspace);
      if (newTab) {
        window.open(`/workspace/${currentWorkspace?.id}/${pageId}`, '_blank');
      } else {
        jumpToPage(currentWorkspace.id, pageId);
      }
    },
    [currentWorkspace, jumpToPage]
  );
  if (!router.isReady) {
    return <PageLoading />;
  }
  if (typeof router.query.workspaceId !== 'string') {
    throw new QueryParamError('workspaceId', router.query.workspaceId);
  }
  if (currentWorkspace === null) {
    return <PageLoading />;
  }
  if (currentWorkspace.flavour === WorkspaceFlavour.AFFINE) {
    const PageList = WorkspacePlugins[currentWorkspace.flavour].UI.PageList;
    return (
      <>
        <Head>
          <title>{t('All Pages')} - AFFiNE</title>
        </Head>
        <WorkspaceTitle
          workspace={currentWorkspace}
          currentPage={null}
          isPreview={false}
          isPublic={false}
          icon={<FolderIcon />}
        >
          {t('All pages')}
        </WorkspaceTitle>
        <PageList
          onOpenPage={onClickPage}
          blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
        />
      </>
    );
  } else if (currentWorkspace.flavour === WorkspaceFlavour.LOCAL) {
    const PageList = WorkspacePlugins[currentWorkspace.flavour].UI.PageList;
    return (
      <>
        <Head>
          <title>{t('All Pages')} - AFFiNE</title>
        </Head>
        <WorkspaceTitle
          workspace={currentWorkspace}
          currentPage={null}
          isPreview={false}
          isPublic={false}
          icon={<FolderIcon />}
        >
          {t('All pages')}
        </WorkspaceTitle>
        <PageList
          onOpenPage={onClickPage}
          blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
        />
      </>
    );
  }
  throw new Unreachable();
};

export default AllPage;

AllPage.getLayout = page => {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
