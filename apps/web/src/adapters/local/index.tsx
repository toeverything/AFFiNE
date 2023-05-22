import { DebugLogger } from '@affine/debug';
import {
  DEFAULT_HELLO_WORLD_PAGE_ID,
  DEFAULT_WORKSPACE_NAME,
} from '@affine/env';
import { initPage } from '@affine/env/blocksuite';
import { PageNotFoundError } from '@affine/env/constant';
import {
  CRUD,
  saveWorkspaceToLocalStorage,
} from '@affine/workspace/local/crud';
import { createIndexedDBBackgroundProvider } from '@affine/workspace/providers';
import {
  LoadPriority,
  ReleaseType,
  WorkspaceFlavour,
} from '@affine/workspace/type';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import { nanoid } from '@blocksuite/store';
import { lazy } from 'react';

import type { WorkspaceAdapter } from '../type';

const WorkspaceSettingDetail = lazy(() =>
  import('../../components/affine/workspace-setting-detail').then(
    ({ WorkspaceSettingDetail }) => ({
      default: WorkspaceSettingDetail,
    })
  )
);
const BlockSuitePageList = lazy(() =>
  import('../../components/blocksuite/block-suite-page-list').then(
    ({ BlockSuitePageList }) => ({
      default: BlockSuitePageList,
    })
  )
);
const PageDetailEditor = lazy(() =>
  import('../../components/page-detail-editor').then(
    ({ PageDetailEditor }) => ({
      default: PageDetailEditor,
    })
  )
);

const logger = new DebugLogger('use-create-first-workspace');

export const LocalPlugin: WorkspaceAdapter<WorkspaceFlavour.LOCAL> = {
  releaseType: ReleaseType.STABLE,
  flavour: WorkspaceFlavour.LOCAL,
  loadPriority: LoadPriority.LOW,
  Events: {
    'app:init': () => {
      const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
        nanoid(),
        WorkspaceFlavour.LOCAL
      );
      blockSuiteWorkspace.meta.setName(DEFAULT_WORKSPACE_NAME);
      const page = blockSuiteWorkspace.createPage({
        id: DEFAULT_HELLO_WORLD_PAGE_ID,
      });
      blockSuiteWorkspace.setPageMeta(page.id, {
        init: true,
      });
      initPage(page);
      blockSuiteWorkspace.setPageMeta(page.id, {
        jumpOnce: true,
      });
      const provider = createIndexedDBBackgroundProvider(blockSuiteWorkspace);
      provider.connect();
      provider.callbacks.add(() => {
        provider.disconnect();
      });
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
            onInit={initPage}
            onLoad={onLoadEditor}
            workspace={currentWorkspace}
          />
        </>
      );
    },
    PageList: ({ blockSuiteWorkspace, onOpenPage }) => {
      return (
        <BlockSuitePageList
          listType="all"
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
