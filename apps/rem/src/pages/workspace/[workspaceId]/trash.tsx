import { useRouter } from 'next/router';

import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useLoadWorkspace } from '../../../hooks/use-load-workspace';
import { useSyncRouterWithCurrentWorkspace } from '../../../hooks/use-sync-router-with-current-workspace';
import { WorkspaceLayout } from '../../../layouts';
import { NextPageWithLayout } from '../../../shared';

const TrashPage: NextPageWithLayout = () => {
  const router = useRouter();
  const [currentWorkspace] = useCurrentWorkspace();
  useLoadWorkspace(currentWorkspace);
  useSyncRouterWithCurrentWorkspace(router);
  return <div>Trash Page</div>;
};

export default TrashPage;

TrashPage.getLayout = page => {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
