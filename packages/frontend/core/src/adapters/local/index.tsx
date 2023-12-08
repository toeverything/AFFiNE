import { DebugLogger } from '@affine/debug';
import { DEFAULT_WORKSPACE_NAME } from '@affine/env/constant';
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
import { getCurrentStore } from '@toeverything/infra/atom';
import { initEmptyPage } from '@toeverything/infra/blocksuite';
import { buildShowcaseWorkspace } from '@toeverything/infra/blocksuite';
import { nanoid } from 'nanoid';

import { setPageModeAtom } from '../../atoms';
import { NewWorkspaceSettingDetail, Provider } from '../shared';

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
      saveWorkspaceToLocalStorage(blockSuiteWorkspace.id);
      logger.debug('create first workspace');
      return [blockSuiteWorkspace.id];
    },
  },
  CRUD,
  UI: {
    Provider,
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
