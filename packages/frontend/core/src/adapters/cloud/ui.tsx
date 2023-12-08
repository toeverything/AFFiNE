import type {
  WorkspaceFlavour,
  WorkspaceUISchema,
} from '@affine/env/workspace';
import { lazy } from 'react';

import { useIsWorkspaceOwner } from '../../hooks/affine/use-is-workspace-owner';
import { NewWorkspaceSettingDetail, Provider } from '../shared';

const LoginCard = lazy(() =>
  import('../../components/cloud/login-card').then(({ LoginCard }) => ({
    default: LoginCard,
  }))
);

export const UI = {
  Provider,
  LoginCard,
  NewSettingsDetail: ({
    currentWorkspaceId,
    onTransformWorkspace,
    onDeleteLocalWorkspace,
    onDeleteCloudWorkspace,
    onLeaveWorkspace,
  }) => {
    const isOwner = useIsWorkspaceOwner(currentWorkspaceId);
    return (
      <NewWorkspaceSettingDetail
        onDeleteLocalWorkspace={onDeleteLocalWorkspace}
        onDeleteCloudWorkspace={onDeleteCloudWorkspace}
        onLeaveWorkspace={onLeaveWorkspace}
        workspaceId={currentWorkspaceId}
        onTransferWorkspace={onTransformWorkspace}
        isOwner={isOwner}
      />
    );
  },
} satisfies WorkspaceUISchema<WorkspaceFlavour.AFFINE_CLOUD>;
