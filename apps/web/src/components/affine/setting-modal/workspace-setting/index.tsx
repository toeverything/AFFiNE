import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';

import type { Workspace } from '../type';

export const WorkSpaceSetting = ({ workspace }: { workspace: Workspace }) => {
  const [workspaceName] = useBlockSuiteWorkspaceName(
    workspace.blockSuiteWorkspace ?? null
  );
  return <div>{workspaceName}</div>;
};
