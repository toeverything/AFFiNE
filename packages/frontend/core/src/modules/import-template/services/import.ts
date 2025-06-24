import type { DocMode } from '@blocksuite/affine/model';
import { ZipTransformer } from '@blocksuite/affine/widgets/linked-doc';
import { Service } from '@toeverything/infra';

import { DocsService } from '../../doc';
import {
  getAFFiNEWorkspaceSchema,
  type WorkspaceMetadata,
  type WorkspacesService,
} from '../../workspace';

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
    await workspace.engine.doc.waitForDocReady(workspace.id); // wait for root doc ready
    const [importedDoc] = await ZipTransformer.importDocs(
      workspace.docCollection,
      getAFFiNEWorkspaceSchema(),
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
    flavour: string,
    workspaceName: string,
    docBinary: Uint8Array
    // todo: support doc mode on init
  ) {
    // oxlint-disable-next-line @typescript-eslint/no-non-null-assertion
    let docId: string = null!;
    const { id: workspaceId } = await this.workspacesService.create(
      flavour,
      async (docCollection, _, docStorage) => {
        docCollection.meta.initialize();
        docCollection.doc.getMap('meta').set('name', workspaceName);
        const doc = docCollection.createDoc();
        docId = doc.id;
        await docStorage.pushDocUpdate({
          docId: doc.spaceDoc.guid,
          bin: docBinary,
        });
      }
    );
    return { workspaceId, docId };
  }
}
