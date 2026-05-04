import { Injectable } from '@nestjs/common';
import { AiPromptRole } from '@prisma/client';

import type { Conversation, Turn } from '../core';
import { chatMessageFromTurn } from '../core';
import type { ResolvedPrompt } from '../prompt';
import { type ChatHistory } from '../types';
import { HistoryAttachmentUrlProjector } from './history-attachment-url-projector';
import { HistoryPromptPreloadProjector } from './history-prompt-preload-projector';
import {
  HistoryVisibilityPolicy,
  type ProjectConversationOptions,
} from './history-visibility-policy';

export type CanonicalConversationHistory = {
  conversation: Conversation;
  turns: Turn[];
  prompt: ResolvedPrompt;
  tokenCost: number;
};

export type CanonicalConversationMeta = Omit<
  CanonicalConversationHistory,
  'turns'
>;

@Injectable()
export class CompatHistoryProjector {
  constructor(
    private readonly visibility: HistoryVisibilityPolicy,
    private readonly preloadProjector: HistoryPromptPreloadProjector,
    private readonly attachmentUrls: HistoryAttachmentUrlProjector
  ) {}

  private projectSessionBase(
    history: CanonicalConversationMeta
  ): Omit<ChatHistory, 'messages'> {
    const { conversation, prompt, tokenCost } = history;
    return {
      userId: conversation.userId,
      sessionId: conversation.id,
      workspaceId: conversation.workspaceId,
      docId: conversation.docId,
      parentSessionId: conversation.parentId,
      pinned: conversation.pinned,
      title: conversation.title,
      action: prompt.action || null,
      model: prompt.model,
      optionalModels: prompt.optionalModels || [],
      promptName: prompt.name,
      tokens: tokenCost,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  projectSession(
    history: CanonicalConversationMeta,
    _options: ProjectConversationOptions
  ): Omit<ChatHistory, 'messages'> | undefined {
    return this.projectSessionBase(history);
  }

  projectHistory(
    history: CanonicalConversationHistory,
    options: ProjectConversationOptions & {
      withMessages: boolean;
      withPrompt?: boolean;
    }
  ): ChatHistory | undefined {
    if (!this.visibility.shouldExposeHistory(history, options)) return;
    const base = this.projectSessionBase(history);

    const { turns } = history;
    const messages = turns.map(turn => chatMessageFromTurn(turn));
    const preload = this.preloadProjector.project(
      history,
      options.withMessages,
      options.withPrompt
    );

    const projectedMessages = options.withMessages
      ? preload
          .concat(messages)
          .filter(
            message =>
              message.role !== AiPromptRole.user ||
              !!message.content.trim() ||
              !!message.attachments?.length
          )
          .map(message => ({ ...message }))
      : [];

    return {
      ...base,
      messages: this.attachmentUrls.projectMessages(projectedMessages),
    };
  }
}
