import { PageNotFoundError } from '@affine/env/constant';
import type {
  WorkspaceFlavour,
  WorkspaceUISchema,
} from '@affine/env/workspace';
import { lazy, useCallback } from 'react';

import type { OnLoadEditor } from '../../components/page-detail-editor';
import { useCurrentUser } from '../../hooks/affine/use-current-user';
import { useIsWorkspaceOwner } from '../../hooks/affine/use-is-workspace-owner';
import { useWorkspace } from '../../hooks/use-workspace';
import {
  NewWorkspaceSettingDetail,
  PageDetailEditor,
  Provider,
} from '../shared';

const LoginCard = lazy(() =>
  import('../../components/cloud/login-card').then(({ LoginCard }) => ({
    default: LoginCard,
  }))
);

export const UI = {
  Provider,
  LoginCard,
  PageDetail: ({ currentWorkspaceId, currentPageId, onLoadEditor }) => {
    const workspace = useWorkspace(currentWorkspaceId);
    const page = workspace.blockSuiteWorkspace.getPage(currentPageId);
    if (!page) {
      throw new PageNotFoundError(workspace.blockSuiteWorkspace, currentPageId);
    }
    // this should be safe because we are under cloud workspace adapter
    const currentUser = useCurrentUser();
    const onLoad = useCallback<OnLoadEditor>(
      (...args) => {
        const dispose = onLoadEditor(...args);
        workspace.blockSuiteWorkspace.awarenessStore.awareness.setLocalStateField(
          'user',
          {
            name: currentUser.name,
          }
        );
        return dispose;
      },
      [currentUser, workspace, onLoadEditor]
    );

    return (
      <PageDetailEditor
        pageId={currentPageId}
        onLoad={onLoad}
        workspace={workspace.blockSuiteWorkspace}
      />
    );
  },
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
