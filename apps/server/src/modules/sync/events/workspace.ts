import { Storage } from '@affine/storage';
import { Injectable } from '@nestjs/common';
import { Doc } from 'yjs';
import * as Y from 'yjs';

import { assertExists } from '../utils';

@Injectable()
export class WorkspaceService {
  constructor(private readonly storage: Storage) {}

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
    const doc = await this.getWorkspace(workspaceId);
    queue.push(doc);

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

    docs[0].guid = workspaceId;
    return docs;
  }

  async getWorkspace(workspaceId: string): Promise<Doc> {
    let workspace = await this.storage.getWorkspace(workspaceId);
    if (!workspace) {
      await this.storage.createWorkspace(workspaceId);
      workspace = await this.storage.getWorkspace(workspaceId);
    }
    assertExists(workspace);
    const doc = await this.getDocFromGuid(workspace.doc.guid);
    assertExists(doc);
    return doc;
  }

  async getDocFromGuid(guid: string): Promise<Doc | null> {
    const doc = new Y.Doc({ guid });
    try {
      const update = await this.storage.load(guid);
      update && Y.applyUpdate(doc, update);
      return doc;
    } catch (e) {
      return null;
    }
  }
}
