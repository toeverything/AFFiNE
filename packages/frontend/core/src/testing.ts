import { WorkspaceFlavour } from '@affine/env/workspace';
import type { Doc as BlockSuiteDoc } from '@blocksuite/store';
import {
  configureTestingInfraModules,
  DocsService,
  Framework,
  WorkspacesService,
} from '@toeverything/infra';

import { configureCommonModules } from './modules';

export async function configureTestingEnvironment() {
  const framework = new Framework();

  configureCommonModules(framework);
  configureTestingInfraModules(framework);

  const frameworkProvider = framework.provider();

  const workspaceManager = frameworkProvider.get(WorkspacesService);

  const { workspace } = workspaceManager.open({
    metadata: await workspaceManager.create(
      WorkspaceFlavour.LOCAL,
      async ws => {
        ws.meta.initialize();
        const initDoc = async (page: BlockSuiteDoc) => {
          page.load();
          const pageBlockId = page.addBlock('affine:page', {
            title: new page.Text(''),
          });
          const frameId = page.addBlock('affine:note', {}, pageBlockId);
          page.addBlock('affine:paragraph', {}, frameId);
        };
        await initDoc(ws.createDoc({ id: 'page0' }));
      }
    ),
  });

  await workspace.engine.waitForDocSynced();

  const { doc } = workspace.scope.get(DocsService).open('page0');

  return { framework: frameworkProvider, workspace, doc };
}
