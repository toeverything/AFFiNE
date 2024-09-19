import { WorkspaceFlavour } from '@affine/env/workspace';
import { assertEquals } from '@blocksuite/affine/global/utils';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';

import { Service } from '../../../framework';
import { transformWorkspaceDBLocalToCloud } from '../../db';
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
   *
   * @param accountId - all local user data will be transformed to this account
   */
  transformLocalToCloud = async (
    local: Workspace,
    accountId: string
  ): Promise<WorkspaceMetadata> => {
    assertEquals(local.flavour, WorkspaceFlavour.LOCAL);

    await local.engine.waitForDocSynced();

    const newMetadata = await this.factory.create(
      WorkspaceFlavour.AFFINE_CLOUD,
      async (docCollection, blobStorage, docStorage) => {
        applyUpdate(
          docCollection.doc,
          encodeStateAsUpdate(local.docCollection.doc)
        );

        for (const subdoc of local.docCollection.doc.getSubdocs()) {
          for (const newSubdoc of docCollection.doc.getSubdocs()) {
            if (newSubdoc.guid === subdoc.guid) {
              applyUpdate(newSubdoc, encodeStateAsUpdate(subdoc));
            }
          }
        }

        // transform db
        await transformWorkspaceDBLocalToCloud(
          local.id,
          docCollection.id,
          local.engine.doc.storage.behavior,
          docStorage,
          accountId
        );

        const blobList = await local.engine.blob.list();

        for (const blobKey of blobList) {
          const blob = await local.engine.blob.get(blobKey);
          if (blob) {
            await blobStorage.set(blobKey, blob);
          }
        }
      }
    );

    await this.destroy.deleteWorkspace(local.meta);

    return newMetadata;
  };
}
