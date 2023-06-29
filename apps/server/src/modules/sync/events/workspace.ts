import { Storage } from '@affine/storage';
import { Injectable } from '@nestjs/common';
import { Doc } from 'yjs';
import * as Y from 'yjs';

import { assertExists, DocUpdate } from '../utils';

@Injectable()
export class WorkspaceService {
  constructor(private readonly storage: Storage) {}

  async getDocsFromWorkspaceId(workspace_id: string): Promise<
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
    queue.push(await this.getDocFromGuid(workspace_id));

    while (queue.length > 0) {
      const doc = queue.pop();
      assertExists(doc);
      docs.push({
        guid: doc.guid,
        update: Y.encodeStateAsUpdate(doc),
      });

      for (const subDoc of doc.subdocs) {
        queue.push(await this.getDocFromGuid(subDoc.guid));
      }
    }

    return docs;
  }

  async getDocFromGuid(guid: string): Promise<Doc> {
    let update;
    try {
      update = await this.storage.load(guid);
    } catch (_) {
      update = createWorkspace();
      await this.storage.syncWithGuid(guid, Buffer.from(update));
    }
    const doc = new Y.Doc();
    if (update) {
      Y.applyUpdate(doc, update);
    }
    return doc;
  }

  async saveWorkspaceUpdate(docUpdate: DocUpdate) {
    await this.storage.syncWithGuid(
      docUpdate.guid,
      Buffer.from(docUpdate.update)
    );
  }
}

function createWorkspace(): Uint8Array {
  const doc = new Doc();
  doc.getMap('space:updated');
  doc.getMap('space:meta');
  return Y.encodeStateAsUpdate(doc);
}
