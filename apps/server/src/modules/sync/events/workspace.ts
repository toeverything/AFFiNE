import { Injectable } from '@nestjs/common';
import { Doc } from 'yjs';
import * as Y from 'yjs';

import { PrismaService } from '../../../prisma';
import { assertExists } from '../utils';

@Injectable()
export class WorkspaceService {
  constructor(private prisma: PrismaService) {}

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
    const updates = await this.prisma.doc.findMany({
      where: {
        guid: guid,
      },
    });

    if (!updates.length) return null;

    const doc = new Y.Doc({ guid });
    for (const update of updates) {
      Y.applyUpdate(doc, update.blob);
    }

    return doc;
  }
}
