import { Service } from '@toeverything/infra';
import { applyUpdate } from 'yjs';

import { transformWorkspaceDBLocalToCloud } from '../../db/utils';
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
    accountId: string,
    flavour: string
  ): Promise<WorkspaceMetadata> => {
    if (local.flavour !== 'local') {
      throw new Error(
        'Only local workspace can be transformed to cloud workspace'
      );
    }

    const localDocStorage = local.engine.doc.storage;
    const localDocList = Array.from(local.docCollection.docs.keys());

    const newMetadata = await this.factory.create(
      flavour,
      async (docCollection, blobStorage, docStorage) => {
        const rootDocBinary = (
          await localDocStorage.getDoc(local.docCollection.doc.guid)
        )?.bin;

        if (rootDocBinary) {
          applyUpdate(docCollection.doc, rootDocBinary);
        }

        for (const subdocId of localDocList) {
          const subdocBinary = (await localDocStorage.getDoc(subdocId))?.bin;
          if (subdocBinary) {
            const doc = docCollection.getDoc(subdocId);
            if (doc) {
              const spaceDoc = doc.spaceDoc;
              doc.load();
              applyUpdate(spaceDoc, subdocBinary);
            }
          }
        }

        // transform db
        await transformWorkspaceDBLocalToCloud(
          local.id,
          docCollection.id,
          localDocStorage,
          docStorage,
          accountId
        );

        const blobList = await local.engine.blob.storage.list();

        for (const { key } of blobList) {
          const blob = await local.engine.blob.storage.get(key);
          if (blob) {
            await blobStorage.set(blob);
          }
        }
      }
    );

    await this.destroy.deleteWorkspace(local.meta);

    return newMetadata;
  };
}
