import { useTranslation } from '@affine/i18n';
import { FolderIcon } from '@blocksuite/icons';
import { assertExists } from '@blocksuite/store';
import { useRouter } from 'next/router';
import React, { useCallback } from 'react';

import {
  QueryParamError,
  Unreachable,
} from '../../../components/affine/affine-error-eoundary';
import { PageLoading } from '../../../components/pure/loading';
import { WorkspaceTitle } from '../../../components/pure/workspace-title';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useLoadWorkspace } from '../../../hooks/use-load-workspace';
import { useSyncRouterWithCurrentWorkspace } from '../../../hooks/use-sync-router-with-current-workspace';
import { WorkspaceLayout } from '../../../layouts';
import { WorkspacePlugins } from '../../../plugins';
import { NextPageWithLayout, RemWorkspaceFlavour } from '../../../shared';
const AllPage: NextPageWithLayout = () => {
  const router = useRouter();
  const [currentWorkspace] = useCurrentWorkspace();
  const { t } = useTranslation();
  useLoadWorkspace(currentWorkspace);
  useSyncRouterWithCurrentWorkspace(router);
  const onClickPage = useCallback(
    (pageId: string, newTab?: boolean) => {
      assertExists(currentWorkspace);
      if (newTab) {
        window.open(`/workspace/${currentWorkspace?.id}/${pageId}`, '_blank');
      } else {
        router.push({
          pathname: '/workspace/[workspaceId]/[pageId]',
          query: {
            workspaceId: currentWorkspace.id,
            pageId,
          },
        });
      }
    },
    [currentWorkspace, router]
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
  if (currentWorkspace.flavour === RemWorkspaceFlavour.AFFINE) {
    const PageList = WorkspacePlugins[currentWorkspace.flavour].PageList;
    if (currentWorkspace.firstBinarySynced) {
      return (
        <>
          <WorkspaceTitle icon={<FolderIcon />}>
            {t('All pages')}
          </WorkspaceTitle>
          <PageList
            onOpenPage={onClickPage}
            blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
          />
        </>
      );
    } else {
      return <div>loading</div>;
    }
  } else if (currentWorkspace.flavour === RemWorkspaceFlavour.LOCAL) {
    const PageList = WorkspacePlugins[currentWorkspace.flavour].PageList;
    return (
      <>
        <WorkspaceTitle icon={<FolderIcon />}>{t('All pages')}</WorkspaceTitle>
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
