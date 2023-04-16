import { DebugLogger } from '@affine/debug';
import {
  DEFAULT_HELLO_WORLD_PAGE_ID,
  DEFAULT_WORKSPACE_NAME,
} from '@affine/env';
import { ensureRootPinboard, initPage } from '@affine/env/blocksuite';
import {
  CRUD,
  saveWorkspaceToLocalStorage,
} from '@affine/workspace/local/crud';
import { createIndexedDBProvider } from '@affine/workspace/providers';
import { LoadPriority, WorkspaceFlavour } from '@affine/workspace/type';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import { nanoid } from '@blocksuite/store';
import React from 'react';

import { PageNotFoundError } from '../../components/affine/affine-error-eoundary';
import { WorkspaceSettingDetail } from '../../components/affine/workspace-setting-detail';
import { BlockSuitePageList } from '../../components/blocksuite/block-suite-page-list';
import { PageDetailEditor } from '../../components/page-detail-editor';
import type { WorkspacePlugin } from '..';

const logger = new DebugLogger('use-create-first-workspace');

export const LocalPlugin: WorkspacePlugin<WorkspaceFlavour.LOCAL> = {
  flavour: WorkspaceFlavour.LOCAL,
  loadPriority: LoadPriority.LOW,
  Events: {
    'app:init': () => {
      const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
        nanoid(),
        (_: string) => undefined
      );
      blockSuiteWorkspace.meta.setName(DEFAULT_WORKSPACE_NAME);
      const page = blockSuiteWorkspace.createPage(DEFAULT_HELLO_WORLD_PAGE_ID);
      blockSuiteWorkspace.setPageMeta(page.id, {
        init: true,
      });
      initPage(page);
      blockSuiteWorkspace.setPageMeta(page.id, {
        jumpOnce: true,
      });
      const provider = createIndexedDBProvider(blockSuiteWorkspace);
      provider.connect();
      provider.callbacks.add(() => {
        provider.disconnect();
      });
      ensureRootPinboard(blockSuiteWorkspace);
      saveWorkspaceToLocalStorage(blockSuiteWorkspace.id);
      logger.debug('create first workspace');
      return [blockSuiteWorkspace.id];
    },
  },
  CRUD,
  UI: {
    Provider: ({ children }) => {
      return <>{children}</>;
    },
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
            workspace={currentWorkspace}
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
