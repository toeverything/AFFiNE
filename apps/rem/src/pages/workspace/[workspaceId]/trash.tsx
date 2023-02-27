import { useTranslation } from '@affine/i18n';
import { DeleteTemporarilyIcon } from '@blocksuite/icons';
import { useRouter } from 'next/router';
import React from 'react';
import { Helmet } from 'react-helmet-async';

import { PageLoading } from '../../../components/pure/loading';
import { WorkspaceTitle } from '../../../components/pure/workspace-title';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useLoadWorkspace } from '../../../hooks/use-load-workspace';
import { useSyncRouterWithCurrentWorkspace } from '../../../hooks/use-sync-router-with-current-workspace';
import { prefetchNecessaryData } from '../../../hooks/use-workspaces';
import { WorkspaceLayout } from '../../../layouts';
import { NextPageWithLayout } from '../../../shared';

prefetchNecessaryData();

const TrashPage: NextPageWithLayout = () => {
  const router = useRouter();
  const [currentWorkspace] = useCurrentWorkspace();
  const { t } = useTranslation();
  useLoadWorkspace(currentWorkspace);
  useSyncRouterWithCurrentWorkspace(router);
  if (!router.isReady) {
    return <PageLoading />;
  } else if (currentWorkspace === null) {
    return <PageLoading />;
  }
  return (
    <>
      <Helmet>
        <title>{t('Trash')} - AFFiNE</title>
      </Helmet>
      <WorkspaceTitle icon={<DeleteTemporarilyIcon />}>
        {t('Trash')}
      </WorkspaceTitle>
      Trash Page
    </>
  );
};

export default TrashPage;

TrashPage.getLayout = page => {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
