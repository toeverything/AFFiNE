import { DebugLogger } from '@affine/debug';
import { initEmptyPage } from '@affine/env/blocksuite';
import {
  DEFAULT_HELLO_WORLD_PAGE_ID_SUFFIX,
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
import { getOrCreateWorkspace } from '@affine/workspace/manager';
import { createIndexedDBDownloadProvider } from '@affine/workspace/providers';
import { nanoid } from '@blocksuite/store';
import { useStaticBlockSuiteWorkspace } from '@toeverything/infra/__internal__/react';
import { getCurrentStore } from '@toeverything/infra/atom';
import { buildShowcaseWorkspace } from '@toeverything/infra/blocksuite';

import { setPageModeAtom } from '../../atoms';
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
      const blockSuiteWorkspace = getOrCreateWorkspace(
        nanoid(),
        WorkspaceFlavour.LOCAL
      );
      blockSuiteWorkspace.meta.setName(DEFAULT_WORKSPACE_NAME);
      if (runtimeConfig.enablePreloading) {
        buildShowcaseWorkspace(blockSuiteWorkspace, {
          store: getCurrentStore(),
          atoms: {
            pageMode: setPageModeAtom,
          },
        }).catch(err => {
          logger.error('init page with preloading failed', err);
        });
      } else {
        const page = blockSuiteWorkspace.createPage({
          id: `${blockSuiteWorkspace.id}-${DEFAULT_HELLO_WORLD_PAGE_ID_SUFFIX}`,
        });
        initEmptyPage(page).catch(error => {
          logger.error('init page with empty failed', error);
        });
      }
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
    PageDetail: ({ currentWorkspaceId, currentPageId, onLoadEditor }) => {
      const workspace = useStaticBlockSuiteWorkspace(currentWorkspaceId);
      const page = workspace.getPage(currentPageId);
      if (!page) {
        throw new PageNotFoundError(workspace, currentPageId);
      }
      return (
        <>
          <PageDetailEditor
            pageId={currentPageId}
            onInit={initEmptyPage}
            onLoad={onLoadEditor}
            workspace={workspace}
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
  },
};
