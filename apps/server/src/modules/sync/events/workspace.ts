import { Injectable } from '@nestjs/common';
import { Doc, encodeStateAsUpdate } from 'yjs';

import { DocManager } from '../../doc';
import { assertExists } from '../utils';

@Injectable()
export class WorkspaceService {
  constructor(private readonly docManager: DocManager) {}

  async getDocsFromWorkspaceId(workspaceId: string): Promise<
    Array<{
      guid: string;
      update: Buffer;
    }>
  > {
    const docs: Array<{
      guid: string;
      update: Buffer;
    }> = [];
    const queue: Array<[string, Doc]> = [];
    // Workspace Doc's guid is the same as workspaceId. This is achieved by when creating a new workspace, the doc guid
    // is manually set to workspaceId.
    const doc = await this.docManager.getLatest(workspaceId, workspaceId);
    if (doc) {
      queue.push([workspaceId, doc]);
    }

    while (queue.length > 0) {
      const head = queue.pop();
      assertExists(head);
      const [guid, doc] = head;
      docs.push({
        guid: guid,
        update: Buffer.from(encodeStateAsUpdate(doc)),
      });

      for (const { guid } of doc.subdocs) {
        const subDoc = await this.docManager.getLatest(workspaceId, guid);
        if (subDoc) {
          queue.push([guid, subDoc]);
        }
      }
    }

    return docs;
  }
}
