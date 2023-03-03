import { useTranslation } from '@affine/i18n';
import { DeleteTemporarilyIcon } from '@blocksuite/icons';
import { assertExists } from '@blocksuite/store';
import { useRouter } from 'next/router';
import React, { useCallback } from 'react';
import { Helmet } from 'react-helmet-async';

import PageList from '../../../components/blocksuite/block-suite-page-list/page-list';
import { PageLoading } from '../../../components/pure/loading';
import { WorkspaceTitle } from '../../../components/pure/workspace-title';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useSyncRouterWithCurrentWorkspace } from '../../../hooks/use-sync-router-with-current-workspace';
import { WorkspaceLayout } from '../../../layouts';
import { NextPageWithLayout } from '../../../shared';

const TrashPage: NextPageWithLayout = () => {
  const router = useRouter();
  const [currentWorkspace] = useCurrentWorkspace();
  const { t } = useTranslation();
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
  } else if (currentWorkspace === null) {
    return <PageLoading />;
  }
  // todo(himself65): refactor to plugin
  const blockSuiteWorkspace = currentWorkspace.blockSuiteWorkspace;
  assertExists(blockSuiteWorkspace);
  return (
    <>
      <Helmet>
        <title>{t('Trash')} - AFFiNE</title>
      </Helmet>
      <WorkspaceTitle icon={<DeleteTemporarilyIcon />}>
        {t('Trash')}
      </WorkspaceTitle>
      <PageList
        blockSuiteWorkspace={blockSuiteWorkspace}
        onClickPage={onClickPage}
        listType="trash"
      />
    </>
  );
};

export default TrashPage;

TrashPage.getLayout = page => {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
