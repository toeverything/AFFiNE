import { DebugLogger } from '@affine/debug';
import {
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
import {
  getOrCreateWorkspace,
  globalBlockSuiteSchema,
} from '@affine/workspace/manager';
import { createIndexedDBDownloadProvider } from '@affine/workspace/providers';
import { getBlockSuiteWorkspaceAtom } from '@toeverything/infra/__internal__/workspace';
import { getCurrentStore } from '@toeverything/infra/atom';
import { initEmptyPage } from '@toeverything/infra/blocksuite';
import { buildShowcaseWorkspace } from '@toeverything/infra/blocksuite';
import { useAtomValue } from 'jotai';
import { nanoid } from 'nanoid';

import { setPageModeAtom } from '../../atoms';
import {
  NewWorkspaceSettingDetail,
  PageDetailEditor,
  Provider,
} from '../shared';

const logger = new DebugLogger('use-create-first-workspace');

export const LocalAdapter: WorkspaceAdapter<WorkspaceFlavour.LOCAL> = {
  releaseType: ReleaseType.STABLE,
  flavour: WorkspaceFlavour.LOCAL,
  loadPriority: LoadPriority.LOW,
  Events: {
    'app:access': async () => true,
    'app:init': () => {
      const blockSuiteWorkspace = getOrCreateWorkspace(
        nanoid(),
        WorkspaceFlavour.LOCAL
      );
      blockSuiteWorkspace.meta.setName(DEFAULT_WORKSPACE_NAME);
      if (runtimeConfig.enablePreloading) {
        buildShowcaseWorkspace(blockSuiteWorkspace, {
          schema: globalBlockSuiteSchema,
          store: getCurrentStore(),
          atoms: {
            pageMode: setPageModeAtom,
          },
        }).catch(err => {
          logger.error('init page with preloading failed', err);
        });
      } else {
        const page = blockSuiteWorkspace.createPage();
        blockSuiteWorkspace.setPageMeta(page.id, {
          jumpOnce: true,
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
    Provider,
    PageDetail: ({ currentWorkspaceId, currentPageId, onLoadEditor }) => {
      const [workspaceAtom] = getBlockSuiteWorkspaceAtom(currentWorkspaceId);
      const workspace = useAtomValue(workspaceAtom);
      const page = workspace.getPage(currentPageId);
      if (!page) {
        throw new PageNotFoundError(workspace, currentPageId);
      }
      return (
        <PageDetailEditor
          pageId={currentPageId}
          onLoad={onLoadEditor}
          workspace={workspace}
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
      return (
        <NewWorkspaceSettingDetail
          onDeleteLocalWorkspace={onDeleteLocalWorkspace}
          onDeleteCloudWorkspace={onDeleteCloudWorkspace}
          onLeaveWorkspace={onLeaveWorkspace}
          workspaceId={currentWorkspaceId}
          onTransferWorkspace={onTransformWorkspace}
          isOwner={true}
        />
      );
    },
  },
};
