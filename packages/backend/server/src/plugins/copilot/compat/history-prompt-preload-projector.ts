import { Injectable } from '@nestjs/common';
import { AiPromptRole } from '@prisma/client';

import { PromptService } from '../prompt/service';
import type { ChatMessage } from '../types';
import type { CanonicalConversationHistory } from './history-projector';

@Injectable()
export class HistoryPromptPreloadProjector {
  constructor(private readonly prompts: PromptService) {}

  project(
    history: CanonicalConversationHistory,
    withMessages: boolean,
    withPrompt?: boolean
  ): ChatMessage[] {
    if (!withMessages || !withPrompt) {
      return [];
    }

    const preload = this.prompts
      .finish(
        history.prompt,
        history.turns[0] ? history.turns[0].metadata : {},
        history.conversation.id
      )
      .filter(({ role }) => role !== AiPromptRole.system) as ChatMessage[];

    preload.forEach((message, index) => {
      message.createdAt = new Date(
        history.conversation.createdAt.getTime() - preload.length - index - 1
      );
    });

    return preload;
  }
}
