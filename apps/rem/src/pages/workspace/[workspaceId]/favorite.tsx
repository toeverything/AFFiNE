import { useRouter } from 'next/router';

import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useLoadWorkspace } from '../../../hooks/use-load-workspace';
import { useSyncRouterWithCurrentWorkspace } from '../../../hooks/use-sync-router-with-current-workspace';
import { prefetchNecessaryData } from '../../../hooks/use-workspaces';
import { WorkspaceLayout } from '../../../layouts';
import { NextPageWithLayout } from '../../../shared';

prefetchNecessaryData();

const FavouritePage: NextPageWithLayout = () => {
  const router = useRouter();
  const [currentWorkspace] = useCurrentWorkspace();
  useLoadWorkspace(currentWorkspace);
  useSyncRouterWithCurrentWorkspace(router);
  return <div>Favourite Page</div>;
};

export default FavouritePage;

FavouritePage.getLayout = page => {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
