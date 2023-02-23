import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import React from 'react';

import { PageLoading } from '../../../components/pure/loading';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useLoadWorkspace } from '../../../hooks/use-load-workspace';
import { useSyncRouterWithCurrentWorkspace } from '../../../hooks/use-sync-router-with-current-workspace';
import { prefetchNecessaryData } from '../../../hooks/use-workspaces';
import { WorkspaceLayout } from '../../../layouts';
import { NextPageWithLayout, RemWorkspaceFlavour } from '../../../shared';
import { UIPlugins } from '../../../shared/ui';

const Editor = dynamic(
  async () => (await import('../../../components/BlockSuiteEditor')).Editor,
  {
    ssr: false,
  }
);

const WorkspaceDetail: React.FC = () => {
  const router = useRouter();
  const { workspaceId, pageId } = router.query;
  const [currentWorkspace] = useCurrentWorkspace();
  if (!currentWorkspace) {
    return <div>No Current Workspace</div>;
  }
  if (currentWorkspace.flavour === RemWorkspaceFlavour.AFFINE) {
    const PageDetail = UIPlugins[currentWorkspace.flavour].PageDetail;
    return <PageDetail currentWorkspace={currentWorkspace}></PageDetail>;
  } else if (currentWorkspace.flavour === RemWorkspaceFlavour.LOCAL) {
    const PageDetail = UIPlugins[currentWorkspace.flavour].PageDetail;
    return <PageDetail currentWorkspace={currentWorkspace}></PageDetail>;
  }
  return <div>impossible</div>;
};

prefetchNecessaryData();

const WorkspaceDetailPage: NextPageWithLayout = () => {
  const router = useRouter();
  useLoadWorkspace(useCurrentWorkspace()[0]);
  useSyncRouterWithCurrentWorkspace(router);
  if (!router.isReady) {
    return <PageLoading />;
  } else if (
    typeof router.query.pageId !== 'string' ||
    typeof router.query.workspaceId !== 'string'
  ) {
    return <>not found router</>;
  }
  return <WorkspaceDetail />;
};

export default WorkspaceDetailPage;

WorkspaceDetailPage.getLayout = page => {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
