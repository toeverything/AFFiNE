import { Storage } from '@affine/storage';
import { Inject, Injectable } from '@nestjs/common';
import { Doc } from 'yjs';
import * as Y from 'yjs';

import { StorageProvide } from '../../../storage';
import { assertExists } from '../utils';

@Injectable()
export class WorkspaceService {
  constructor(@Inject(StorageProvide) private readonly storage: Storage) {}

  async getDocsFromWorkspaceId(workspaceId: string): Promise<
    Array<{
      guid: string;
      update: Uint8Array;
    }>
  > {
    const docs: Array<{
      guid: string;
      update: Uint8Array;
    }> = [];
    const queue: Array<Doc> = [];
    // Workspace Doc's guid is the same as workspaceId. This is achieved by when creating a new workspace, the doc guid
    // is manually set to workspaceId.
    const doc = await this.getDocFromGuid(workspaceId);
    doc && queue.push(doc);

    while (queue.length > 0) {
      const doc = queue.pop();
      assertExists(doc);
      docs.push({
        guid: doc.guid,
        update: Y.encodeStateAsUpdate(doc),
      });

      for (const { guid } of doc.subdocs) {
        const subDoc = await this.getDocFromGuid(guid);
        subDoc && queue.push(subDoc);
      }
    }

    return docs;
  }

  async getDocFromGuid(guid: string): Promise<Doc | null> {
    const doc = new Y.Doc({ guid });
    try {
      // TODO load method return null if doc doesn't exist, error throwing is not needed.
      const update = await this.storage.load(guid);
      update && Y.applyUpdate(doc, update);
      return doc;
    } catch (e) {
      return null;
    }
  }
}
