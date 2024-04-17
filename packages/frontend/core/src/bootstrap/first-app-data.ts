import { DebugLogger } from '@affine/debug';
import { DEFAULT_WORKSPACE_NAME } from '@affine/env/constant';
import { WorkspaceFlavour } from '@affine/env/workspace';
import onboardingUrl from '@affine/templates/onboarding.zip';
import { ZipTransformer } from '@blocksuite/blocks';
import {
  initEmptyPage,
  PageRecordList,
  type WorkspaceManager,
} from '@toeverything/infra';

export async function buildShowcaseWorkspace(
  workspaceManager: WorkspaceManager,
  flavour: WorkspaceFlavour,
  workspaceName: string
) {
  const meta = await workspaceManager.createWorkspace(
    flavour,
    async docCollection => {
      docCollection.meta.setName(workspaceName);
      const blob = await (await fetch(onboardingUrl)).blob();

      await ZipTransformer.importDocs(docCollection, blob);
    }
  );

  const { workspace, release } = workspaceManager.open(meta);

  await workspace.engine.waitForRootDocReady();

  const pageRecordList = workspace.services.get(PageRecordList);

  // todo: find better way to do the following
  // perhaps put them into middleware?
  {
    // the "Write, Draw, Plan all at Once." page should be set to edgeless mode
    const edgelessPage1 = pageRecordList.records$.value.find(
      p => p.title$.value === 'Write, Draw, Plan all at Once.'
    );

    if (edgelessPage1) {
      edgelessPage1.setMode('edgeless');
    }

    // should jump to "Write, Draw, Plan all at Once." by default
    const defaultPage = pageRecordList.records$.value.find(p =>
      p.title$.value.startsWith('Write, Draw, Plan all at Once.')
    );

    if (defaultPage) {
      defaultPage.setMeta({
        jumpOnce: true,
      });
    }
  }
  release();
  return meta;
}

const logger = new DebugLogger('createFirstAppData');

export async function createFirstAppData(workspaceManager: WorkspaceManager) {
  if (localStorage.getItem('is-first-open') !== null) {
    return;
  }
  localStorage.setItem('is-first-open', 'false');
  if (runtimeConfig.enablePreloading) {
    const workspaceMetadata = await buildShowcaseWorkspace(
      workspaceManager,
      WorkspaceFlavour.LOCAL,
      DEFAULT_WORKSPACE_NAME
    );
    logger.info('create first workspace', workspaceMetadata);
    return workspaceMetadata;
  } else {
    const workspaceMetadata = await workspaceManager.createWorkspace(
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
