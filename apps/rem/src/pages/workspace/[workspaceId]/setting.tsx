import { useRouter } from 'next/router';

import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useSyncRouterWithCurrentWorkspace } from '../../../hooks/use-sync-router-with-current-workspace';
import { WorkspaceLayout } from '../../../layouts';
import { UIPlugins } from '../../../plugins';
import { NextPageWithLayout, RemWorkspaceFlavour } from '../../../shared';

const SettingPage: NextPageWithLayout = () => {
  const router = useRouter();
  const [currentWorkspace] = useCurrentWorkspace();
  useSyncRouterWithCurrentWorkspace(router);
  if (!router.isReady) {
    return <div>loading</div>;
  }
  if (!currentWorkspace) {
    return <div>loading</div>;
  }
  if (currentWorkspace.flavour === RemWorkspaceFlavour.AFFINE) {
    const Setting = UIPlugins[currentWorkspace.flavour].Setting;
    return <Setting currentWorkspace={currentWorkspace} />;
  } else if (currentWorkspace.flavour === RemWorkspaceFlavour.LOCAL) {
    const Setting = UIPlugins[currentWorkspace.flavour].Setting;
    return <Setting currentWorkspace={currentWorkspace} />;
  }
  return <div>impossible</div>;
};

export default SettingPage;

SettingPage.getLayout = page => {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
