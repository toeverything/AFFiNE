import { Injectable } from '@nestjs/common';

import { OnEvent } from '../../base';
import { Models } from '../../models';
import { DocReader } from './reader';

@Injectable()
export class DocEventsListener {
  constructor(
    private readonly docReader: DocReader,
    private readonly models: Models
  ) {}

  @OnEvent('doc.snapshot.updated')
  async markDocContentCacheStale({
    workspaceId,
    docId,
    blob,
  }: Events['doc.snapshot.updated']) {
    await this.docReader.markDocContentCacheStale(workspaceId, docId);
    const isDoc = workspaceId !== docId;
    // update doc content to database
    if (isDoc) {
      const content = this.docReader.parseDocContent(blob);
      if (!content) {
        return;
      }
      await this.models.doc.upsertMeta(workspaceId, docId, content);
    } else {
      // update workspace content to database
      const content = this.docReader.parseWorkspaceContent(blob);
      if (!content) {
        return;
      }
      await this.models.workspace.update(workspaceId, content);
    }
  }
}
