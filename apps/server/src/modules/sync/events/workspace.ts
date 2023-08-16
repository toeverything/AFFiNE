import { Injectable } from '@nestjs/common';
import { applyUpdate, Doc } from 'yjs';

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
    const queue: Array<[string, Buffer]> = [];
    // Workspace Doc's guid is the same as workspaceId. This is achieved by when creating a new workspace, the doc guid
    // is manually set to workspaceId.
    const update = await this.docManager.getLatest(workspaceId, workspaceId);
    if (update) {
      queue.push([workspaceId, update]);
    }

    while (queue.length > 0) {
      const update = queue.pop();
      assertExists(update);
      const [guid, buf] = update;
      docs.push({
        guid: guid,
        update: buf,
      });

      const doc = new Doc({ guid });
      applyUpdate(doc, buf);

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
