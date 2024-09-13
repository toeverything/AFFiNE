import type { WorkspaceFlavour } from '@affine/env/workspace';
import { type DocMode, ZipTransformer } from '@blocksuite/blocks';
import type { WorkspaceMetadata, WorkspacesService } from '@toeverything/infra';
import { DocsService, Service } from '@toeverything/infra';

export class ImportTemplateService extends Service {
  constructor(private readonly workspacesService: WorkspacesService) {
    super();
  }

  async importToWorkspace(
    workspaceMetadata: WorkspaceMetadata,
    docBinary: Uint8Array,
    mode: DocMode
  ) {
    const { workspace, dispose: disposeWorkspace } =
      this.workspacesService.open({
        metadata: workspaceMetadata,
      });
    await workspace.engine.waitForRootDocReady();
    const [importedDoc] = await ZipTransformer.importDocs(
      workspace.docCollection,
      new Blob([docBinary], {
        type: 'application/zip',
      })
    );
    const docsService = workspace.scope.get(DocsService);
    if (importedDoc) {
      // only support page mode for now
      docsService.list.setPrimaryMode(importedDoc.id, mode);
      disposeWorkspace();
      return importedDoc.id;
    } else {
      throw new Error('Failed to import doc');
    }
  }

  async importToNewWorkspace(
    flavour: WorkspaceFlavour,
    workspaceName: string,
    docBinary: Uint8Array
    // todo: support doc mode on init
  ) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    let docId: string = null!;
    const { id: workspaceId } = await this.workspacesService.create(
      flavour,
      async (docCollection, _, docStorage) => {
        docCollection.meta.initialize();
        docCollection.meta.setName(workspaceName);
        const doc = docCollection.createDoc();
        docId = doc.id;
        await docStorage.doc.set(doc.spaceDoc.guid, docBinary);
      }
    );
    return { workspaceId, docId };
  }
}
