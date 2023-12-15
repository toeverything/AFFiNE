import { DebugLogger } from '@affine/debug';
import { DEFAULT_WORKSPACE_NAME } from '@affine/env/constant';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { workspaceManager } from '@affine/workspace';
import { getCurrentStore } from '@toeverything/infra/atom';
import {
  buildShowcaseWorkspace,
  initEmptyPage,
} from '@toeverything/infra/blocksuite';

import { setPageModeAtom } from '../atoms';

const logger = new DebugLogger('affine:first-app-data');

export async function createFirstAppData() {
  if (localStorage.getItem('is-first-open') !== null) {
    return;
  }
  localStorage.setItem('is-first-open', 'false');
  const workspaceId = await workspaceManager.createWorkspace(
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
  console.info('create first workspace', workspaceId);
  return workspaceId;
}
