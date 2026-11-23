import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { AiSessionMessageRole } from '@prisma/client';

import {
  CopilotActionTaken,
  CopilotMessageNotFound,
  CopilotPromptNotFound,
  CopilotSessionInvalidInput,
  CopilotSessionNotFound,
  Mutex,
} from '../../base';
import {
  CleanupSessionOptions,
  ListSessionOptions,
  Models,
  type UpdateChatSession,
  UpdateChatSessionOptions,
} from '../../models';
import { ConversationPolicy } from './conversation/policy';
import { ConversationStore } from './conversation/store';
import { type Conversation, promptMessageFromTurn, type Turn } from './core';
import type { ResolvedPrompt } from './prompt';
import { PromptService } from './prompt/service';
import { type PromptMessage, type PromptParams } from './providers/types';
import { PromptRuntime } from './runtime/prompt-runtime';
import {
  type ChatSessionForkOptions,
  type ChatSessionOptions,
  type ChatSessionState,
} from './types';

export class ChatSession {
  private readonly renderPromptSession: (
    prompt: ResolvedPrompt,
    turns: PromptMessage[],
    params: PromptParams,
    sessionId?: string
  ) => PromptMessage[];
  constructor(
    private readonly state: ChatSessionState,
    renderPromptSession: (
      prompt: ResolvedPrompt,
      turns: PromptMessage[],
      params: PromptParams,
      sessionId?: string
    ) => PromptMessage[]
  ) {
    this.renderPromptSession = renderPromptSession;
  }

  get config() {
    const {
      sessionId,
      userId,
      workspaceId,
      docId,
      focus,
      prompt: { name: promptName, action: promptAction, config: promptConfig },
    } = this.state;

    return {
      sessionId,
      userId,
      workspaceId,
      docId,
      focus,
      promptName,
      promptAction,
      promptConfig,
    };
  }

  get latestUserTurn() {
    return this.state.turns.findLast(({ role }) => role === 'user');
  }

  findTurn(turnId: string) {
    return this.state.turns.find(({ id }) => id === turnId);
  }

  pushPersistedTurn(turn: Turn) {
    if (
      this.state.prompt.action &&
      this.state.turns.length > 0 &&
      turn.role === 'user'
    ) {
      throw new CopilotActionTaken();
    }
    this.state.turns.push(turn);
  }

  revertLatestMessage(removeLatestUserMessage: boolean) {
    const turns = this.state.turns;
    turns.splice(
      turns.findLastIndex(({ role }) => role === AiSessionMessageRole.user) +
        (removeLatestUserMessage ? 0 : 1)
    );
  }

  finish(params: PromptParams): PromptMessage[] {
    return this.renderPromptSession(
      this.state.prompt,
      this.state.turns.map(turn => promptMessageFromTurn(turn)),
      params,
      this.state.sessionId
    );
  }
}

export type ConversationState = {
  conversation: Conversation;
  turns: Turn[];
  focus: ChatSessionState['focus'];
  prompt: ResolvedPrompt;
};

export type ConversationMetaState = {
  conversation: Conversation;
  focus: ChatSessionState['focus'];
  prompt: ResolvedPrompt;
};

type StoredConversation = NonNullable<
  Awaited<ReturnType<ConversationStore['get']>>
>;

type StoredConversationMeta = NonNullable<
  Awaited<ReturnType<ConversationStore['getMeta']>>
>;

@Injectable()
export class ChatSessionService {
  private readonly logger = new Logger(ChatSessionService.name);

  constructor(
    private readonly models: Models,
    private readonly store: ConversationStore,
    private readonly conversationPolicy: ConversationPolicy,
    private readonly prompts: PromptService,
    private readonly promptRuntime: PromptRuntime,
    private readonly mutex: Mutex
  ) {}

  private stripNullBytes(value?: string | null): string {
    if (!value) return '';
    return value.replaceAll('\0', '');
  }

  private isNullByteError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.message.includes('\\u0000') ||
        error.message.includes('unsupported Unicode escape sequence') ||
        error.message.includes('22P05'))
    );
  }

  private async toConversationState(
    session: StoredConversation
  ): Promise<ConversationState> {
    const { conversation, prompt } =
      await this.toConversationMetaState(session);

    return {
      conversation,
      turns: session.turns,
      focus: session.focus,
      prompt,
    };
  }

  private async toConversationMetaState(
    session: StoredConversation | StoredConversationMeta
  ): Promise<ConversationMetaState> {
    const prompt = await this.prompts.get(session.promptName);
    if (!prompt) throw new CopilotPromptNotFound({ name: session.promptName });

    return {
      conversation: session.conversation,
      focus: session.focus,
      prompt,
    };
  }

  async getState(
    sessionId: string,
    userId: string,
    workspaceId: string,
    personal?: boolean
  ): Promise<ConversationState | undefined> {
    const session = await this.store.get(
      sessionId,
      userId,
      workspaceId,
      personal
    );
    if (!session) return;

    return await this.toConversationState(session);
  }

  async getMetaState(
    sessionId: string,
    userId: string,
    workspaceId: string,
    personal?: boolean
  ): Promise<ConversationMetaState | undefined> {
    const session = await this.store.getMeta(
      sessionId,
      userId,
      workspaceId,
      personal
    );
    if (!session) return;

    return await this.toConversationMetaState(session);
  }

  async count(options: ListSessionOptions): Promise<number> {
    return await this.store.count(options);
  }

  async listStates(options: ListSessionOptions): Promise<ConversationState[]> {
    const sessions = await this.store.list({
      ...options,
      withMessages: true,
    });

    const states = await Promise.all(
      sessions.map(async session => {
        try {
          return await this.toConversationState(session);
        } catch (e) {
          this.logger.error(
            'Unexpected error in list copilot conversations',
            e
          );
        }
        return undefined;
      })
    );

    return states.filter((v): v is NonNullable<typeof v> => !!v);
  }

  async listMetaStates(
    options: ListSessionOptions
  ): Promise<ConversationMetaState[]> {
    const sessions = await this.store.listMeta(options);

    const states = await Promise.all(
      sessions.map(async session => {
        try {
          return await this.toConversationMetaState(session);
        } catch (e) {
          this.logger.error(
            'Unexpected error in list copilot conversation metadata',
            e
          );
        }
        return undefined;
      })
    );

    return states.filter((v): v is NonNullable<typeof v> => !!v);
  }

  async getQuota(userId: string) {
    return await this.conversationPolicy.getQuota(userId);
  }

  async checkQuota(userId: string) {
    await this.conversationPolicy.checkQuota(userId);
  }

  async create(options: ChatSessionOptions): Promise<string> {
    const sessionId = randomUUID();
    const prompt = await this.prompts.get(options.promptName);
    if (!prompt) {
      this.logger.error(`Prompt not found: ${options.promptName}`);
      throw new CopilotPromptNotFound({ name: options.promptName });
    }

    // validate prompt compatibility with session type
    this.models.copilotSession.checkSessionPrompt(options, prompt);

    return await this.store.create(
      {
        ...options,
        sessionId,
        prompt,
        title: null,
        messages: [],
        // when client create chat session, we always find root session
        parentSessionId: null,
      },
      options.reuseLatestChat ?? true
    );
  }

  @Transactional()
  async unpin(workspaceId: string, userId: string) {
    await this.store.unpin(workspaceId, userId);
  }

  @Transactional()
  async update(options: UpdateChatSession): Promise<string> {
    const state = await this.getState(
      options.sessionId,
      options.userId,
      options.workspaceId,
      options.personal
    );
    if (!state) {
      throw new CopilotSessionNotFound();
    }

    const finalData: UpdateChatSessionOptions = {
      userId: options.userId,
      sessionId: options.sessionId,
      workspaceId: options.workspaceId,
      personal: options.personal,
    };
    if (options.promptName) {
      const prompt = await this.prompts.get(options.promptName);
      if (!prompt) {
        this.logger.error(`Prompt not found: ${options.promptName}`);
        throw new CopilotPromptNotFound({ name: options.promptName });
      }

      this.models.copilotSession.checkSessionPrompt(
        {
          docId: state.conversation.docId,
          pinned: state.conversation.pinned,
        },
        prompt
      );
      finalData.promptName = prompt.name;
      finalData.promptAction = prompt.action ?? null;
    }
    finalData.pinned = options.pinned;
    finalData.docId = options.docId;

    if (
      options.promptName === undefined &&
      options.pinned === undefined &&
      options.docId === undefined
    ) {
      throw new CopilotSessionInvalidInput(
        'No valid fields to update in the session'
      );
    }

    return await this.store.update(finalData);
  }

  @Transactional()
  async fork(options: ChatSessionForkOptions): Promise<string> {
    const state = await this.getState(
      options.sessionId,
      options.userId,
      options.workspaceId,
      options.personal
    );
    if (!state) {
      throw new CopilotSessionNotFound();
    }

    let turns = state.turns;
    if (options.latestMessageId) {
      const lastMessageIdx = state.turns.findLastIndex(
        ({ id, role }) =>
          role === AiSessionMessageRole.assistant &&
          id === options.latestMessageId
      );
      if (lastMessageIdx < 0) {
        throw new CopilotMessageNotFound({
          messageId: options.latestMessageId,
        });
      }
      turns = turns.slice(0, lastMessageIdx + 1);
    }

    return await this.store.fork({
      userId: options.userId,
      workspaceId: state.conversation.workspaceId,
      docId: options.docId,
      sessionId: randomUUID(),
      parentSessionId: options.sessionId,
      pinned: state.conversation.pinned,
      title: state.conversation.title,
      personal: options.personal,
      prompt: {
        name: state.prompt.name,
        action: state.prompt.action,
      },
      turns,
    });
  }

  async cleanup(options: CleanupSessionOptions) {
    return await this.store.cleanup(options);
  }

  async getMessage(
    sessionId: string,
    userId: string,
    workspaceId: string,
    messageId: string
  ) {
    const message = await this.models.copilotSession.getMessage(
      sessionId,
      userId,
      workspaceId,
      messageId
    );
    if (!message) {
      throw new CopilotMessageNotFound({ messageId });
    }
    return message;
  }

  async appendTurn(input: {
    sessionId: string;
    userId: string;
    workspaceId: string;
    personal?: boolean;
    turn: Turn;
    compatSubmissionId?: string;
    focus?: ChatSessionState['focus'];
    artifacts?: Array<{
      artifactId: string;
      role: string;
      displayName?: string;
      metadata?: Record<string, unknown>;
    }>;
  }) {
    return await this.store.appendTurn(input);
  }

  async findTurnByCompatSubmissionId(
    sessionId: string,
    userId: string,
    workspaceId: string,
    compatSubmissionId: string
  ) {
    return await this.store.findTurnByCompatSubmissionId(
      sessionId,
      userId,
      workspaceId,
      compatSubmissionId
    );
  }

  // revert the latest messages not generate by user
  // after revert, we can retry the action
  async revertLatestMessage(
    sessionId: string,
    userId: string,
    removeLatestUserMessage: boolean,
    workspaceId: string,
    personal?: boolean
  ) {
    await this.store.revertLatestTurn(
      sessionId,
      userId,
      removeLatestUserMessage,
      workspaceId,
      personal
    );
  }

  async get(
    sessionId: string,
    userId: string,
    workspaceId: string,
    personal?: boolean
  ): Promise<ChatSession | null> {
    const state = await this.getState(sessionId, userId, workspaceId, personal);
    if (state) {
      return new ChatSession(
        {
          userId: state.conversation.userId,
          sessionId: state.conversation.id,
          workspaceId: state.conversation.workspaceId,
          docId: state.conversation.docId,
          turns: state.turns,
          focus: state.focus,
          prompt: state.prompt,
        },
        (prompt, turns, params, sessionId) =>
          this.prompts.renderSession(prompt, turns, params, sessionId)
      );
    }
    return null;
  }

  async getInScope(input: {
    sessionId: string;
    userId: string;
    workspaceId: string;
    personal: boolean;
  }) {
    return await this.get(
      input.sessionId,
      input.userId,
      input.workspaceId,
      input.personal
    );
  }

  async getOwnedScope(sessionId: string, userId: string) {
    return await this.models.copilotSession.getOwnedScope(sessionId, userId);
  }

  async generateSessionTitle(job: {
    sessionId: string;
    userId: string;
    workspaceId: string;
  }) {
    const { sessionId, userId, workspaceId } = job;
    try {
      await using lock = await this.mutex.acquire(`copilot:title:${sessionId}`);
      if (!lock) return;

      const stored = await this.store.getForBackground(
        sessionId,
        userId,
        workspaceId
      );
      const state = stored ? await this.toConversationState(stored) : undefined;
      if (!state) {
        this.logger.warn(
          `Session ${sessionId} not found when generating title`
        );
        return;
      }
      const { conversation } = state;
      const turns = state.turns.map(turn => ({
        ...turn,
        content: this.stripNullBytes(turn.content),
      }));

      if (
        !this.conversationPolicy.shouldGenerateTitle({
          title: conversation.title,
          turns,
        })
      ) {
        return;
      }

      const promptContent =
        this.conversationPolicy.buildTitlePromptContent(turns);
      const generatedTitle = this.stripNullBytes(
        await this.promptRuntime.runText(
          'Summary as title',
          { content: promptContent },
          {
            providerOptions: {
              user: conversation.userId,
              workspace: conversation.workspaceId,
              featureKind: 'chat',
              quotaBackedRoutesAllowed: true,
            },
          }
        )
      ).trim();

      if (!generatedTitle) {
        this.logger.warn(
          `Generated empty title for session ${sessionId}, skip updating`
        );
        return;
      }
      await this.models.copilotSession.setTitleIfAbsent({
        userId: conversation.userId,
        sessionId,
        workspaceId: conversation.workspaceId,
        title: generatedTitle,
      });
    } catch (error) {
      const context = {
        sessionId,
        cause: error instanceof Error ? error.cause : error,
      };
      if (this.isNullByteError(error)) {
        this.logger.warn(
          `Skip title generation for session ${sessionId} due to invalid null bytes in stored data`,
          context
        );
        return;
      }
      this.logger.error(
        `Failed to generate title for session ${sessionId}:`,
        context
      );
      throw error;
    }
  }
}
