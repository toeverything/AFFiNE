import { Injectable } from '@nestjs/common';

import {
  CleanupSessionOptions,
  ListSessionOptions,
  Models,
  UpdateChatSessionOptions,
} from '../../../models';
import {
  chatMessageFromTurn,
  type Conversation,
  type Turn,
  turnFromChatMessage,
} from '../core';
import { type ChatMessage, ChatMessageSchema } from '../types';

type SessionRecord = NonNullable<
  Awaited<ReturnType<Models['copilotSession']['get']>>
>;

type ConversationSeed = Parameters<
  Models['copilotSession']['createWithPrompt']
>[0];

type ForkConversationSeed = Parameters<Models['copilotSession']['fork']>[0];

type ForkTurnsInput = Omit<ForkConversationSeed, 'messages'> & {
  turns: Turn[];
};

@Injectable()
export class ConversationStore {
  constructor(private readonly models: Models) {}

  /**
   * Durable-history boundary only.
   *
   * This store intentionally does not own:
   * - quota / model / pin policy
   * - title generation
   * - prompt preload or rendering
   * - compat ChatHistory / SSE projection
   */

  private toConversation(session: SessionRecord): Conversation {
    return {
      id: session.id,
      userId: session.userId,
      workspaceId: session.workspaceId,
      docId: session.docId,
      pinned: session.pinned,
      parentId: session.parentSessionId,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private toTurns(session: SessionRecord): Turn[] {
    return this.toMessages(session.messages).map(message =>
      turnFromChatMessage(message, session.id)
    );
  }

  private toMessages(messages: unknown): ChatMessage[] {
    const parsed = ChatMessageSchema.array().safeParse(messages ?? []);
    if (!parsed.success) return [];
    return parsed.data;
  }

  async create(
    seed: ConversationSeed,
    reuseLatestChat = false
  ): Promise<string> {
    return await this.models.copilotSession.createWithPrompt(
      seed,
      reuseLatestChat
    );
  }

  async get(sessionId: string): Promise<
    | {
        conversation: Conversation;
        turns: Turn[];
        promptName: string;
        tokenCost: number;
      }
    | undefined
  > {
    const session = await this.models.copilotSession.get(sessionId);
    if (!session) {
      return;
    }

    return {
      conversation: this.toConversation(session),
      turns: this.toTurns(session),
      promptName: session.promptName,
      tokenCost: session.tokenCost,
    };
  }

  async getMeta(sessionId: string): Promise<
    | {
        conversation: Conversation;
        promptName: string;
        tokenCost: number;
      }
    | undefined
  > {
    const session = await this.models.copilotSession.getMeta(sessionId);
    if (!session) return;

    return {
      conversation: {
        id: session.id,
        userId: session.userId,
        workspaceId: session.workspaceId,
        docId: session.docId,
        pinned: session.pinned,
        parentId: session.parentSessionId,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
      promptName: session.promptName,
      tokenCost: session.tokenCost,
    };
  }

  async list(options: ListSessionOptions) {
    const sessions = await this.models.copilotSession.list(options);
    return sessions.map(session => ({
      conversation: {
        id: session.id,
        userId: session.userId,
        workspaceId: session.workspaceId,
        docId: session.docId,
        pinned: session.pinned,
        parentId: session.parentSessionId,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      } satisfies Conversation,
      turns: this.toMessages(session.messages).map(message =>
        turnFromChatMessage(message, session.id)
      ),
      promptName: session.promptName,
      tokenCost: session.tokenCost,
    }));
  }

  async listMeta(options: ListSessionOptions) {
    const sessions = await this.models.copilotSession.list({
      ...options,
      withMessages: false,
    });
    return sessions.map(session => ({
      conversation: {
        id: session.id,
        userId: session.userId,
        workspaceId: session.workspaceId,
        docId: session.docId,
        pinned: session.pinned,
        parentId: session.parentSessionId,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      } satisfies Conversation,
      promptName: session.promptName,
      tokenCost: session.tokenCost,
    }));
  }

  async appendTurns(input: {
    sessionId: string;
    userId: string;
    prompt: { model: string };
    turns: Turn[];
  }) {
    return await this.models.copilotSession.updateMessages({
      ...input,
      messages: input.turns.map(turn => {
        const { id: _id, ...message } = chatMessageFromTurn(turn);
        return message;
      }),
    });
  }

  async appendTurn(input: {
    sessionId: string;
    userId: string;
    prompt: { model: string };
    turn: Turn;
    compatSubmissionId?: string;
  }) {
    const message = await this.models.copilotSession.appendMessage({
      sessionId: input.sessionId,
      userId: input.userId,
      prompt: input.prompt,
      message: (() => {
        const { id: _id, ...message } = chatMessageFromTurn(input.turn);
        return { ...message, compatSubmissionId: input.compatSubmissionId };
      })(),
    });

    return turnFromChatMessage(message, input.sessionId);
  }

  async findTurnByCompatSubmissionId(
    sessionId: string,
    compatSubmissionId: string
  ): Promise<Turn | undefined> {
    const message =
      await this.models.copilotSession.findMessageByCompatSubmissionId(
        sessionId,
        compatSubmissionId
      );
    if (!message) return;

    return turnFromChatMessage(message, sessionId);
  }

  async update(options: UpdateChatSessionOptions): Promise<string> {
    return await this.models.copilotSession.update(options);
  }

  async fork(seed: ForkTurnsInput): Promise<string> {
    return await this.models.copilotSession.fork({
      ...seed,
      messages: seed.turns.map(turn => {
        const { id: _id, ...message } = chatMessageFromTurn(turn);
        return message;
      }),
    });
  }

  async revertLatestTurn(sessionId: string, removeLatestUserMessage: boolean) {
    return await this.models.copilotSession.revertLatestMessage(
      sessionId,
      removeLatestUserMessage
    );
  }

  async cleanup(options: CleanupSessionOptions): Promise<string[]> {
    return await this.models.copilotSession.cleanup(options);
  }

  async count(options: ListSessionOptions): Promise<number> {
    return await this.models.copilotSession.count(options);
  }

  async unpin(workspaceId: string, userId: string) {
    return await this.models.copilotSession.unpin(workspaceId, userId);
  }
}
