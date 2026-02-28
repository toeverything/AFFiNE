import { Injectable } from '@nestjs/common';

import { OnEvent } from '../../base';
import { Models } from '../../models';

@Injectable()
export class EventsListener {
  constructor(private readonly models: Models) {}

  @OnEvent('doc.created')
  async setDefaultPageOwner(payload: Events['doc.created']) {
    const { workspaceId, docId, editor } = payload;

    if (!editor) {
      return;
    }

    await this.models.docUser.setOwner(workspaceId, docId, editor);
  }
}
