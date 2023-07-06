import { DebugLogger } from '@affine/debug';
import { initEmptyPage, initPageWithPreloading } from '@affine/env/blocksuite';
import {
  DEFAULT_HELLO_WORLD_PAGE_ID,
  DEFAULT_WORKSPACE_NAME,
  PageNotFoundError,
} from '@affine/env/constant';
import type { LocalIndexedDBDownloadProvider } from '@affine/env/workspace';
import type { WorkspaceAdapter } from '@affine/env/workspace';
import {
  LoadPriority,
  ReleaseType,
  WorkspaceFlavour,
} from '@affine/env/workspace';
import {
  CRUD,
  saveWorkspaceToLocalStorage,
} from '@affine/workspace/local/crud';
import { createIndexedDBDownloadProvider } from '@affine/workspace/providers';
import { createEmptyBlockSuiteWorkspace } from '@affine/workspace/utils';
import { nanoid } from '@blocksuite/store';

import {
  BlockSuitePageList,
  NewWorkspaceSettingDetail,
  PageDetailEditor,
  WorkspaceHeader,
} from '../shared';

const logger = new DebugLogger('use-create-first-workspace');

export const LocalAdapter: WorkspaceAdapter<WorkspaceFlavour.LOCAL> = {
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
      if (runtimeConfig.enablePreloading) {
        initPageWithPreloading(page).catch(err => {
          logger.error('init page with preloading failed', err);
        });
      } else {
        initEmptyPage(page).catch(error => {
          logger.error('init page with empty failed', error);
        });
      }
      blockSuiteWorkspace.setPageMeta(page.id, {
        jumpOnce: true,
      });
      const provider = createIndexedDBDownloadProvider(
        blockSuiteWorkspace.id,
        blockSuiteWorkspace.doc,
        {
          awareness: blockSuiteWorkspace.awarenessStore.awareness,
        }
      ) as LocalIndexedDBDownloadProvider;
      provider.sync();
      provider.whenReady.catch(console.error);
      saveWorkspaceToLocalStorage(blockSuiteWorkspace.id);
      logger.debug('create first workspace');
      return [blockSuiteWorkspace.id];
    },
  },
  CRUD,
  UI: {
    Header: WorkspaceHeader,
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
          key={currentWorkspace.id}
          onTransferWorkspace={onTransformWorkspace}
        />
      );
    },
  },
};
