import { initEmptyPage } from '@affine/env/blocksuite';
import { PageNotFoundError } from '@affine/env/constant';
import type {
  WorkspaceFlavour,
  WorkspaceUISchema,
} from '@affine/env/workspace';
import { lazy } from 'react';

import {
  BlockSuitePageList,
  NewWorkspaceSettingDetail,
  PageDetailEditor,
  WorkspaceHeader,
} from '../shared';

const Provider = lazy(() =>
  import('../../components/cloud/provider').then(({ Provider }) => ({
    default: Provider,
  }))
);

const LoginCard = lazy(() =>
  import('../../components/cloud/login-card').then(({ LoginCard }) => ({
    default: LoginCard,
  }))
);

export const UI = {
  Provider,
  LoginCard,
  Header: WorkspaceHeader,
  PageDetail: ({ currentWorkspace, currentPageId, onLoadEditor }) => {
    const page = currentWorkspace.blockSuiteWorkspace.getPage(currentPageId);
    if (!page) {
      throw new PageNotFoundError(
        currentWorkspace.blockSuiteWorkspace,
        currentPageId
      );
    }
    return (
      <>
        <PageDetailEditor
          pageId={currentPageId}
          onInit={initEmptyPage}
          onLoad={onLoadEditor}
          workspace={currentWorkspace}
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
    currentWorkspace,
    onDeleteWorkspace,
    onTransformWorkspace,
  }) => {
    return (
      <NewWorkspaceSettingDetail
        onDeleteWorkspace={onDeleteWorkspace}
        workspace={currentWorkspace}
        onTransferWorkspace={onTransformWorkspace}
      />
    );
  },
} satisfies WorkspaceUISchema<WorkspaceFlavour.AFFINE_CLOUD>;
