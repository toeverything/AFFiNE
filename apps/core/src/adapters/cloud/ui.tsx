import { initEmptyPage } from '@affine/env/blocksuite';
import { PageNotFoundError } from '@affine/env/constant';
import type {
  WorkspaceFlavour,
  WorkspaceUISchema,
} from '@affine/env/workspace';
import { lazy } from 'react';

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
          onInit={initEmptyPage}
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
    onDeleteWorkspace,
    onTransformWorkspace,
  }) => {
    return (
      <NewWorkspaceSettingDetail
        onDeleteWorkspace={onDeleteWorkspace}
        workspaceId={currentWorkspaceId}
        onTransferWorkspace={onTransformWorkspace}
      />
    );
  },
} satisfies WorkspaceUISchema<WorkspaceFlavour.AFFINE_CLOUD>;
