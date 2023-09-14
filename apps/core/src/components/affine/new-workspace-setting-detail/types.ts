import type {
  WorkspaceFlavour,
  WorkspaceRegistry,
} from '@affine/env/workspace';

export interface WorkspaceSettingDetailProps {
  workspaceId: string;
  isOwner: boolean;
  onDeleteLocalWorkspace: () => void;
  onDeleteCloudWorkspace: () => void;
  onLeaveWorkspace: () => void;
  onTransferWorkspace: <
    From extends WorkspaceFlavour,
    To extends WorkspaceFlavour,
  >(
    from: From,
    to: To,
    workspace: WorkspaceRegistry[From]
  ) => void;
}
