import type { DocMode } from '@affine/graphql';
import { Service } from '@toeverything/infra';

import type { NotificationStore } from '../stores/notification';

export class NotificationService extends Service {
  constructor(private readonly store: NotificationStore) {
    super();
  }

  async mentionUser(
    userId: string,
    workspaceId: string,
    doc: {
      id: string;
      title: string;
      blockId?: string;
      elementId?: string;
      mode: DocMode;
    }
  ): Promise<string> {
    return this.store.mentionUser(userId, workspaceId, doc);
  }
}
