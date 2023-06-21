import type {
  WorkspaceFlavour,
  WorkspaceRegistry,
} from '@affine/env/workspace';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import type { FC } from 'react';

import type { AffineOfficialWorkspace } from '../../../shared';

export type WorkspaceSettingDetailProps = {
  workspace: AffineOfficialWorkspace;
  onDeleteWorkspace: () => Promise<void>;
  onTransferWorkspace: <
    From extends WorkspaceFlavour,
    To extends WorkspaceFlavour
  >(
    from: From,
    to: To,
    workspace: WorkspaceRegistry[From]
  ) => void;
};

export const WorkspaceSettingDetail: FC<WorkspaceSettingDetailProps> = ({
  workspace,
}) => {
  const [workspaceName] = useBlockSuiteWorkspaceName(
    workspace.blockSuiteWorkspace ?? null
  );
  return (
    <div>
      <h2>New Workspace Setting Coming Soon!</h2>

      {workspaceName}
    </div>
  );
};
