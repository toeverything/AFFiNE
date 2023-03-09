import { useTranslation } from '@affine/i18n';
import { FolderIcon } from '@blocksuite/icons';
import { assertExists, nanoid } from '@blocksuite/store';
import Head from 'next/head';
import { useRouter } from 'next/router';
import React, { useCallback, useEffect } from 'react';

import {
  QueryParamError,
  Unreachable,
} from '../../../components/affine/affine-error-eoundary';
import { PageLoading } from '../../../components/pure/loading';
import { WorkspaceTitle } from '../../../components/pure/workspace-title';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useRouterHelper } from '../../../hooks/use-router-helper';
import { useSyncRouterWithCurrentWorkspace } from '../../../hooks/use-sync-router-with-current-workspace';
import { WorkspaceLayout } from '../../../layouts';
import { WorkspacePlugins } from '../../../plugins';
import { NextPageWithLayout, RemWorkspaceFlavour } from '../../../shared';

const AllPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { jumpToPage } = useRouterHelper(router);
  const [currentWorkspace] = useCurrentWorkspace();
  const { t } = useTranslation();
  useSyncRouterWithCurrentWorkspace(router);
  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    const id = setTimeout(() => {
      if (currentWorkspace?.blockSuiteWorkspace.isEmpty) {
        // this is a new workspace, so we should redirect to the new page
        const pageId = nanoid();
        currentWorkspace.blockSuiteWorkspace.slots.pageAdded.once(id => {
          currentWorkspace.blockSuiteWorkspace.setPageMeta(id, {
            init: true,
          });
          assertExists(pageId, id);
          jumpToPage(currentWorkspace.id, pageId);
        });
        currentWorkspace.blockSuiteWorkspace.createPage(pageId);
      }
    }, 1000);
    return () => {
      clearTimeout(id);
    };
  }, [currentWorkspace, jumpToPage, router]);
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
  if (currentWorkspace.flavour === RemWorkspaceFlavour.AFFINE) {
    const PageList = WorkspacePlugins[currentWorkspace.flavour].UI.PageList;
    return (
      <>
        <Head>
          <title>{t('All Pages')} - AFFiNE</title>
        </Head>
        <WorkspaceTitle icon={<FolderIcon />}>{t('All pages')}</WorkspaceTitle>
        <PageList
          onOpenPage={onClickPage}
          blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
        />
      </>
    );
  } else if (currentWorkspace.flavour === RemWorkspaceFlavour.LOCAL) {
    const PageList = WorkspacePlugins[currentWorkspace.flavour].UI.PageList;
    return (
      <>
        <Head>
          <title>{t('All Pages')} - AFFiNE</title>
        </Head>
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
