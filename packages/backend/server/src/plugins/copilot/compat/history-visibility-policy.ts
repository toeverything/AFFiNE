import { Injectable } from '@nestjs/common';

import type { CanonicalConversationHistory } from './history-projector';

export type ProjectConversationOptions = {
  requestUserId: string | undefined;
  action?: boolean;
  skipVisibilityFilter?: boolean;
};

@Injectable()
export class HistoryVisibilityPolicy {
  shouldExposeHistory(
    history: CanonicalConversationHistory,
    options: ProjectConversationOptions
  ): boolean {
    if (options.skipVisibilityFilter) {
      return true;
    }

    return !(
      (history.conversation.userId === options.requestUserId &&
        !!options.action !== !!history.prompt.action) ||
      (history.conversation.userId !== options.requestUserId &&
        !!history.prompt.action)
    );
  }
}
