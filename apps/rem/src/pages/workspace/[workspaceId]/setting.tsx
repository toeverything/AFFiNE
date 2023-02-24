import { useRouter } from 'next/router';

import { useSyncRouterWithCurrentWorkspace } from '../../../hooks/use-sync-router-with-current-workspace';
import { WorkspaceLayout } from '../../../layouts';
import { NextPageWithLayout } from '../../../shared';

const SettingPage: NextPageWithLayout = () => {
  const router = useRouter();
  useSyncRouterWithCurrentWorkspace(router);
  return <div>Setting</div>;
};

export default SettingPage;

SettingPage.getLayout = page => {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
