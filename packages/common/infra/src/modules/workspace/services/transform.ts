import { WorkspaceFlavour } from '@affine/env/workspace';
import { assertEquals } from '@blocksuite/global/utils';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';

import { Service } from '../../../framework';
import type { Workspace } from '../entities/workspace';
import type { WorkspaceMetadata } from '../metadata';
import type { WorkspaceDestroyService } from './destroy';
import type { WorkspaceFactoryService } from './factory';

export class WorkspaceTransformService extends Service {
  constructor(
    private readonly factory: WorkspaceFactoryService,
    private readonly destroy: WorkspaceDestroyService
  ) {
    super();
  }

  /**
   * helper function to transform local workspace to cloud workspace
   */
  transformLocalToCloud = async (
    local: Workspace
  ): Promise<WorkspaceMetadata> => {
    assertEquals(local.flavour, WorkspaceFlavour.LOCAL);

    await local.engine.waitForDocSynced();

    const newMetadata = await this.factory.create(
      WorkspaceFlavour.AFFINE_CLOUD,
      async (ws, bs) => {
        applyUpdate(ws.doc, encodeStateAsUpdate(local.docCollection.doc));

        for (const subdoc of local.docCollection.doc.getSubdocs()) {
          for (const newSubdoc of ws.doc.getSubdocs()) {
            if (newSubdoc.guid === subdoc.guid) {
              applyUpdate(newSubdoc, encodeStateAsUpdate(subdoc));
            }
          }
        }

        const blobList = await local.engine.blob.list();

        for (const blobKey of blobList) {
          const blob = await local.engine.blob.get(blobKey);
          if (blob) {
            await bs.set(blobKey, blob);
          }
        }
      }
    );

    await this.destroy.deleteWorkspace(local.meta);

    return newMetadata;
  };
}
