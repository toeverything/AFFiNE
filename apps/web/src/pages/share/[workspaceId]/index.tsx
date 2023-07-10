import { assertExists } from '@blocksuite/global/utils';
import { useAtomValue } from 'jotai';

import { useIsPublicCloudWorkspace } from '../../../hooks/affine/use-is-public-cloud-workspace';
import {
  publicWorkspaceIdAtom,
  PublicWorkspaceLayout,
} from '../../../layouts/public-workspace-layout';
import type { NextPageWithLayout } from '../../../shared';

const ShareWorkspacePage: NextPageWithLayout = () => {
  const workspaceId = useAtomValue(publicWorkspaceIdAtom);
  assertExists(workspaceId);
  const isPublic = useIsPublicCloudWorkspace(workspaceId);
  return <div>{isPublic ? 'Public Workspace' : 'Not Public Workspace'}</div>;
};

export default ShareWorkspacePage;

ShareWorkspacePage.getLayout = page => {
  return <PublicWorkspaceLayout>{page}</PublicWorkspaceLayout>;
};
