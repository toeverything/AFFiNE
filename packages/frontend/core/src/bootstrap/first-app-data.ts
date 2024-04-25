import { DebugLogger } from '@affine/debug';
import { DEFAULT_WORKSPACE_NAME } from '@affine/env/constant';
import { WorkspaceFlavour } from '@affine/env/workspace';
import onboardingUrl from '@affine/templates/onboarding.zip';
import { ZipTransformer } from '@blocksuite/blocks';
import type { WorkspacesService } from '@toeverything/infra';
import { DocsService, initEmptyPage } from '@toeverything/infra';

export async function buildShowcaseWorkspace(
  workspacesService: WorkspacesService,
  flavour: WorkspaceFlavour,
  workspaceName: string
) {
  const meta = await workspacesService.create(flavour, async docCollection => {
    docCollection.meta.setName(workspaceName);
    const blob = await (await fetch(onboardingUrl)).blob();

    await ZipTransformer.importDocs(docCollection, blob);
  });

  const { workspace, dispose } = workspacesService.open({ metadata: meta });

  await workspace.engine.waitForRootDocReady();

  const docsService = workspace.scope.get(DocsService);

  // todo: find better way to do the following
  // perhaps put them into middleware?
  {
    // the "Write, Draw, Plan all at Once." page should be set to edgeless mode
    const edgelessPage1 = docsService.list.docs$.value.find(
      p => p.title$.value === 'Write, Draw, Plan all at Once.'
    );

    if (edgelessPage1) {
      edgelessPage1.setMode('edgeless');
    }

    // should jump to "Write, Draw, Plan all at Once." by default
    const defaultPage = docsService.list.docs$.value.find(p =>
      p.title$.value.startsWith('Write, Draw, Plan all at Once.')
    );

    if (defaultPage) {
      defaultPage.setMeta({
        jumpOnce: true,
      });
    }
  }
  dispose();
  return meta;
}

const logger = new DebugLogger('createFirstAppData');

export async function createFirstAppData(workspacesService: WorkspacesService) {
  if (localStorage.getItem('is-first-open') !== null) {
    return;
  }
  localStorage.setItem('is-first-open', 'false');
  if (runtimeConfig.enablePreloading) {
    const workspaceMetadata = await buildShowcaseWorkspace(
      workspacesService,
      WorkspaceFlavour.LOCAL,
      DEFAULT_WORKSPACE_NAME
    );
    logger.info('create first workspace', workspaceMetadata);
    return workspaceMetadata;
  } else {
    const workspaceMetadata = await workspacesService.create(
      WorkspaceFlavour.LOCAL,
      async workspace => {
        workspace.meta.setName(DEFAULT_WORKSPACE_NAME);
        const page = workspace.createDoc();
        workspace.setDocMeta(page.id, {
          jumpOnce: true,
        });
        initEmptyPage(page);
      }
    );
    logger.info('create first workspace', workspaceMetadata);
    return workspaceMetadata;
  }
}
