import { CRUD } from '@affine/workspace/local/crud';
import { LoadPriority, WorkspaceFlavour } from '@affine/workspace/type';
import React from 'react';

import { PageNotFoundError } from '../../components/affine/affine-error-eoundary';
import { WorkspaceSettingDetail } from '../../components/affine/workspace-setting-detail';
import { BlockSuitePageList } from '../../components/blocksuite/block-suite-page-list';
import { PageDetailEditor } from '../../components/page-detail-editor';
import { initPage } from '../../utils';
import type { WorkspacePlugin } from '..';

export const LocalPlugin: WorkspacePlugin<WorkspaceFlavour.LOCAL> = {
  flavour: WorkspaceFlavour.LOCAL,
  loadPriority: LoadPriority.LOW,
  CRUD,
  UI: {
    PageDetail: ({ currentWorkspace, currentPageId }) => {
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
            onInit={initPage}
            blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
          />
        </>
      );
    },
    PageList: ({ blockSuiteWorkspace, onOpenPage }) => {
      return (
        <BlockSuitePageList
          onOpenPage={onOpenPage}
          blockSuiteWorkspace={blockSuiteWorkspace}
        />
      );
    },
    SettingsDetail: ({
      currentWorkspace,
      onChangeTab,
      currentTab,
      onDeleteWorkspace,
      onTransformWorkspace,
    }) => {
      return (
        <WorkspaceSettingDetail
          onDeleteWorkspace={onDeleteWorkspace}
          onChangeTab={onChangeTab}
          currentTab={currentTab}
          workspace={currentWorkspace}
          onTransferWorkspace={onTransformWorkspace}
        />
      );
    },
  },
};
