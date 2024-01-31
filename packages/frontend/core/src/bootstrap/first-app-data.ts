import { DebugLogger } from '@affine/debug';
import { DEFAULT_WORKSPACE_NAME } from '@affine/env/constant';
import { WorkspaceFlavour } from '@affine/env/workspace';
import type { WorkspaceManager } from '@toeverything/infra';
import { getCurrentStore } from '@toeverything/infra/atom';
import {
  buildShowcaseWorkspace,
  initEmptyPage,
} from '@toeverything/infra/blocksuite';

import { setPageModeAtom } from '../atoms';

const logger = new DebugLogger('affine:first-app-data');

export async function createFirstAppData(workspaceManager: WorkspaceManager) {
  if (localStorage.getItem('is-first-open') !== null) {
    return;
  }
  localStorage.setItem('is-first-open', 'false');
  const workspaceMetadata = await workspaceManager.createWorkspace(
    WorkspaceFlavour.LOCAL,
    async workspace => {
      workspace.meta.setName(DEFAULT_WORKSPACE_NAME);
      if (runtimeConfig.enablePreloading) {
        await buildShowcaseWorkspace(workspace, {
          store: getCurrentStore(),
          atoms: {
            pageMode: setPageModeAtom,
          },
        });
      } else {
        const page = workspace.createPage();
        workspace.setPageMeta(page.id, {
          jumpOnce: true,
        });
        await initEmptyPage(page);
      }
      logger.debug('create first workspace');
    }
  );
  console.info('create first workspace', workspaceMetadata);
  return workspaceMetadata;
}
