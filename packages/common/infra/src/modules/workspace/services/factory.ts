import type { WorkspaceFlavour } from '@affine/env/workspace';
import type { DocCollection } from '@blocksuite/affine/store';

import { Service } from '../../../framework';
import type { BlobStorage, DocStorage } from '../../../sync';
import type { WorkspaceFlavourProvider } from '../providers/flavour';

export class WorkspaceFactoryService extends Service {
  constructor(private readonly providers: WorkspaceFlavourProvider[]) {
    super();
  }

  /**
   * create workspace
   * @param flavour workspace flavour
   * @param initial callback to put initial data to workspace
   * @returns workspace id
   */
  create = async (
    flavour: WorkspaceFlavour,
    initial: (
      docCollection: DocCollection,
      blobStorage: BlobStorage,
      docStorage: DocStorage
    ) => Promise<void> = () => Promise.resolve()
  ) => {
    const provider = this.providers.find(x => x.flavour === flavour);
    if (!provider) {
      throw new Error(`Unknown workspace flavour: ${flavour}`);
    }
    const metadata = await provider.createWorkspace(initial);
    return metadata;
  };
}
