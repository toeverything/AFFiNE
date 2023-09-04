import { PageNotFoundError } from '@affine/env/constant';
import type {
  WorkspaceFlavour,
  WorkspaceUISchema,
} from '@affine/env/workspace';
import { initEmptyPage } from '@toeverything/infra/blocksuite';
import { lazy, useCallback } from 'react';

import { useIsWorkspaceOwner } from '../../hooks/affine/use-is-workspace-owner';
import { useWorkspace } from '../../hooks/use-workspace';
import {
  BlockSuitePageList,
  NewWorkspaceSettingDetail,
  PageDetailEditor,
  Provider,
  WorkspaceHeader,
} from '../shared';

const LoginCard = lazy(() =>
  import('../../components/cloud/login-card').then(({ LoginCard }) => ({
    default: LoginCard,
  }))
);

export const UI = {
  Provider,
  LoginCard,
  Header: WorkspaceHeader,
  PageDetail: ({ currentWorkspaceId, currentPageId, onLoadEditor }) => {
    const workspace = useWorkspace(currentWorkspaceId);
    const page = workspace.blockSuiteWorkspace.getPage(currentPageId);
    if (!page) {
      throw new PageNotFoundError(workspace.blockSuiteWorkspace, currentPageId);
    }
    return (
      <>
        <PageDetailEditor
          pageId={currentPageId}
          onInit={useCallback(async page => initEmptyPage(page), [])}
          onLoad={onLoadEditor}
          workspace={workspace.blockSuiteWorkspace}
        />
      </>
    );
  },
  PageList: ({ blockSuiteWorkspace, onOpenPage, collection }) => {
    return (
      <BlockSuitePageList
        listType="all"
        collection={collection}
        onOpenPage={onOpenPage}
        blockSuiteWorkspace={blockSuiteWorkspace}
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
