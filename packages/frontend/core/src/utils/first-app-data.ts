// the following import is used to ensure the block suite editor effects are run
import '../blocksuite/block-suite-editor';

import { DebugLogger } from '@affine/debug';
import { DEFAULT_WORKSPACE_NAME } from '@affine/env/constant';
import onboardingUrl from '@affine/templates/onboarding.zip';
import { ZipTransformer } from '@blocksuite/affine/widgets/linked-doc';

import { DocsService } from '../modules/doc';
import { OrganizeService } from '../modules/organize';
import {
  getAFFiNEWorkspaceSchema,
  type WorkspacesService,
} from '../modules/workspace';

async function getDefaultWorkspacePageId(
  workspacesService: WorkspacesService,
  meta: Parameters<WorkspacesService['open']>[0]['metadata']
) {
  const { workspace, dispose } = workspacesService.open({ metadata: meta });

  await workspace.engine.doc.waitForDocReady(workspace.id);

  const docsService = workspace.scope.get(DocsService);
  const defaultDoc = docsService.list.docs$.value.find(p =>
    p.title$.value.startsWith('Getting Started')
  );
  dispose();

  return defaultDoc?.id;
}

export async function buildShowcaseWorkspace(
  workspacesService: WorkspacesService,
  flavour: string,
  workspaceName: string
) {
  const meta = await workspacesService.create(flavour, async docCollection => {
    docCollection.meta.initialize();
    docCollection.doc.getMap('meta').set('name', workspaceName);
    const blob = await (await fetch(onboardingUrl)).blob();

    await ZipTransformer.importDocs(
      docCollection,
      getAFFiNEWorkspaceSchema(),
      blob
    );
  });

  const { workspace, dispose } = workspacesService.open({ metadata: meta });

  await workspace.engine.doc.waitForDocReady(workspace.id);

  const docsService = workspace.scope.get(DocsService);

  // should jump to "Getting Started"
  const defaultDoc = docsService.list.docs$.value.find(p =>
    p.title$.value.startsWith('Getting Started')
  );
  const folderTutorialDoc = docsService.list.docs$.value.find(p =>
    p.title$.value.startsWith('How to use folder and Tags')
  );

  // create default organize
  if (folderTutorialDoc) {
    const organizeService = workspace.scope.get(OrganizeService);
    const folderId = organizeService.folderTree.rootFolder.createFolder(
      'First Folder',
      organizeService.folderTree.rootFolder.indexAt('after')
    );
    const firstFolderNode =
      organizeService.folderTree.folderNode$(folderId).value;
    firstFolderNode?.createLink(
      'doc',
      folderTutorialDoc.id,
      firstFolderNode.indexAt('after')
    );
  }

  dispose();

  return { meta, defaultDocId: defaultDoc?.id };
}

const logger = new DebugLogger('createFirstAppData');

export async function createFirstAppData(workspacesService: WorkspacesService) {
  if (localStorage.getItem('is-first-open') !== null) {
    return;
  }
  localStorage.setItem('is-first-open', 'false');
  const { meta, defaultDocId } = await buildShowcaseWorkspace(
    workspacesService,
    'local',
    DEFAULT_WORKSPACE_NAME
  );
  logger.info('create first workspace', defaultDocId);
  return { meta, defaultPageId: defaultDocId };
}

export async function ensureDefaultLocalWorkspace(
  workspacesService: WorkspacesService
) {
  await workspacesService.list.waitForRevalidation();
  const list = workspacesService.list.workspaces$.value;
  const lastId = localStorage.getItem('last_workspace_id');
  const existing =
    list.find(workspace => workspace.id === lastId) ??
    list.find(workspace => workspace.flavour === 'local') ??
    list[0];

  if (existing) {
    const lastPageId =
      existing.flavour === 'local' && existing.id === lastId
        ? localStorage.getItem('last_page_id')
        : null;
    const defaultPageId =
      existing.flavour === 'local'
        ? (lastPageId ??
          (await getDefaultWorkspacePageId(workspacesService, existing)))
        : undefined;

    return { meta: existing, defaultPageId };
  }

  const created = await createFirstAppData(workspacesService);
  if (created) {
    return created;
  }

  // On web, an empty workspace list after the first run (e.g. the user deleted
  // their last workspace) should surface the no-workspace page instead of
  // silently recreating one. Native always needs a workspace available.
  if (!BUILD_CONFIG.isNative) {
    return undefined;
  }

  const { meta, defaultDocId } = await buildShowcaseWorkspace(
    workspacesService,
    'local',
    DEFAULT_WORKSPACE_NAME
  );
  return { meta, defaultPageId: defaultDocId };
}
