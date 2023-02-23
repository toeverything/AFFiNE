import { NextPage } from 'next';
import { useRouter } from 'next/router';

import { useSyncRouterWithCurrentWorkspace } from '../hooks/use-sync-router-with-current-workspace';
import { prefetchNecessaryData } from '../hooks/use-workspaces';

prefetchNecessaryData();
const IndexPage: NextPage = () => {
  const router = useRouter();
  useSyncRouterWithCurrentWorkspace(router);
  return <div>Redirecting...</div>;
};

export default IndexPage;
