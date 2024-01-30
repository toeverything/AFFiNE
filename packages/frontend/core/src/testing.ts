import { WorkspaceFlavour } from '@affine/env/workspace';
import type { Page as BlockSuitePage } from '@blocksuite/store';
import {
  configureTestingInfraServices,
  PageManager,
  ServiceCollection,
  WorkspaceManager,
} from '@toeverything/infra';

import { CurrentPageService } from './modules/page';
import { CurrentWorkspaceService } from './modules/workspace';
import { configureWebServices } from './web';

export async function configureTestingEnvironment() {
  const serviceCollection = new ServiceCollection();

  configureWebServices(serviceCollection);
  configureTestingInfraServices(serviceCollection);

  const rootServices = serviceCollection.provider();

  const workspaceManager = rootServices.get(WorkspaceManager);

  const { workspace } = workspaceManager.open(
    await workspaceManager.createWorkspace(WorkspaceFlavour.LOCAL, async ws => {
      const initPage = async (page: BlockSuitePage) => {
        await page.load();
        const pageBlockId = page.addBlock('affine:page', {
          title: new page.Text(''),
        });
        const frameId = page.addBlock('affine:note', {}, pageBlockId);
        page.addBlock('affine:paragraph', {}, frameId);
      };
      await initPage(ws.createPage({ id: 'page0' }));
    })
  );

  await workspace.engine.sync.waitForSynced();

  const { page } = workspace.services.get(PageManager).openByPageId('page0');

  rootServices.get(CurrentWorkspaceService).openWorkspace(workspace);
  workspace.services.get(CurrentPageService).openPage(page);

  return { services: rootServices, workspace, page };
}
