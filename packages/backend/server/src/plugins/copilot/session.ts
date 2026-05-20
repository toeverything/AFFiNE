import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { AiPromptRole } from '@prisma/client';

import {
  CopilotActionTaken,
  CopilotMessageNotFound,
  CopilotPromptNotFound,
  CopilotSessionInvalidInput,
  CopilotSessionNotFound,
  JobQueue,
  OnJob,
} from '../../base';
import {
  CleanupSessionOptions,
  ListSessionOptions,
  Models,
  type UpdateChatSession,
  UpdateChatSessionOptions,
} from '../../models';
import { CopilotAccessPolicy } from './access';
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

declare global {
  interface Jobs {
    'copilot.session.generateTitle': {
      sessionId: string;
    };
    'copilot.session.deleteDoc': {
      workspaceId: string;
      docId: string;
    };
  }
}

const BACKGROUND_COPILOT_JOB_PRIORITY = 100;

export class ChatSession implements AsyncDisposable {
  private stashTurnCount = 0;
  private readonly renderPromptSession: (
    prompt: ResolvedPrompt,
    turns: PromptMessage[],
    params: PromptParams,
    maxTokenSize: number,
    sessionId?: string
  ) => PromptMessage[];
  constructor(
    private readonly state: ChatSessionState,
    renderPromptSession: (
      prompt: ResolvedPrompt,
      turns: PromptMessage[],
      params: PromptParams,
      maxTokenSize: number,
      sessionId?: string
    ) => PromptMessage[],
    private readonly dispose?: (state: ChatSessionState) => Promise<void>,
    private readonly maxTokenSize = state.prompt.config?.maxTokens || 128 * 1024
  ) {
    this.renderPromptSession = renderPromptSession;
  }

  get model() {
    return this.state.prompt.model;
  }

  get optionalModels() {
    return this.state.prompt.optionalModels;
  }

  get config() {
    const {
      sessionId,
      userId,
      workspaceId,
      docId,
      prompt: { name: promptName, config: promptConfig },
    } = this.state;

    return { sessionId, userId, workspaceId, docId, promptName, promptConfig };
  }

  get stashTurns() {
    if (!this.stashTurnCount) return [];
    return this.state.turns.slice(-this.stashTurnCount);
  }

  get latestUserTurn() {
    return this.state.turns.findLast(({ role }) => role === 'user');
  }

  findTurn(turnId: string) {
    return this.state.turns.find(({ id }) => id === turnId);
  }

  private appendTurn(turn: Turn, persisted: boolean) {
    if (
      this.state.prompt.action &&
      this.state.turns.length > 0 &&
      turn.role === 'user'
    ) {
      throw new CopilotActionTaken();
    }
    this.state.turns.push(turn);
    if (!persisted) {
      this.stashTurnCount += 1;
    }
  }

  pushTurn(turn: Turn) {
    this.appendTurn(turn, false);
  }

  pushPersistedTurn(turn: Turn) {
    this.appendTurn(turn, true);
  }

  revertLatestMessage(removeLatestUserMessage: boolean) {
    const turns = this.state.turns;
    turns.splice(
      turns.findLastIndex(({ role }) => role === AiPromptRole.user) +
        (removeLatestUserMessage ? 0 : 1)
    );
  }

  finish(params: PromptParams): PromptMessage[] {
    return this.renderPromptSession(
      this.state.prompt,
      this.state.turns.map(turn => promptMessageFromTurn(turn)),
      params,
      this.maxTokenSize,
      this.state.sessionId
    );
  }

  async save() {
    await this.dispose?.({
      ...this.state,
      turns: this.state.turns.slice(-this.stashTurnCount),
    });
    this.stashTurnCount = 0;
  }

  async [Symbol.asyncDispose]() {
    await this.save?.();
  }
}

export type ConversationState = {
  conversation: Conversation;
  turns: Turn[];
  prompt: ResolvedPrompt;
  tokenCost: number;
};

export type ConversationMetaState = {
  conversation: Conversation;
  prompt: ResolvedPrompt;
  tokenCost: number;
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
    private readonly jobs: JobQueue,
    private readonly store: ConversationStore,
    private readonly access: CopilotAccessPolicy,
    private readonly conversationPolicy: ConversationPolicy,
    private readonly prompts: PromptService,
    private readonly promptRuntime: PromptRuntime
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
    const { conversation, prompt, tokenCost } =
      await this.toConversationMetaState(session);

    return {
      conversation,
      turns: session.turns,
      prompt,
      tokenCost,
    };
  }

  private async toConversationMetaState(
    session: StoredConversation | StoredConversationMeta
  ): Promise<ConversationMetaState> {
    const prompt = await this.prompts.get(session.promptName);
    if (!prompt) throw new CopilotPromptNotFound({ name: session.promptName });

    return {
      conversation: session.conversation,
      prompt,
      tokenCost: session.tokenCost,
    };
  }

  async getState(sessionId: string): Promise<ConversationState | undefined> {
    const session = await this.store.get(sessionId);
    if (!session) return;

    return await this.toConversationState(session);
  }

  async getMetaState(
    sessionId: string
  ): Promise<ConversationMetaState | undefined> {
    const session = await this.store.getMeta(sessionId);
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
    return await this.access.getQuota(userId);
  }

  async checkQuota(userId: string) {
    await this.access.checkQuota(userId);
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
    const state = await this.getState(options.sessionId);
    if (!state) {
      throw new CopilotSessionNotFound();
    }

    const finalData: UpdateChatSessionOptions = {
      userId: options.userId,
      sessionId: options.sessionId,
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
      finalData.promptModel = prompt.model;
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
    const state = await this.getState(options.sessionId);
    if (!state) {
      throw new CopilotSessionNotFound();
    }

    let turns = state.turns;
    if (options.latestMessageId) {
      const lastMessageIdx = state.turns.findLastIndex(
        ({ id, role }) =>
          role === AiPromptRole.assistant && id === options.latestMessageId
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
      prompt: {
        name: state.prompt.name,
        action: state.prompt.action,
        model: state.prompt.model,
      },
      turns,
    });
  }

  async cleanup(options: CleanupSessionOptions) {
    return await this.store.cleanup(options);
  }

  async getMessage(sessionId: string, messageId: string) {
    const message = await this.models.copilotSession.getMessage(
      sessionId,
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
    prompt: { model: string };
    turn: Turn;
    compatSubmissionId?: string;
  }) {
    return await this.store.appendTurn(input);
  }

  async findTurnByCompatSubmissionId(
    sessionId: string,
    compatSubmissionId: string
  ) {
    return await this.store.findTurnByCompatSubmissionId(
      sessionId,
      compatSubmissionId
    );
  }

  // revert the latest messages not generate by user
  // after revert, we can retry the action
  async revertLatestMessage(
    sessionId: string,
    removeLatestUserMessage: boolean
  ) {
    await this.store.revertLatestTurn(sessionId, removeLatestUserMessage);
  }

  /**
   * usage:
   * ``` typescript
   * {
   *     // allocate a session, can be reused chat in about 12 hours with same session
   *     await using session = await session.get(sessionId);
   *     session.pushTurn(turn);
   *     copilot.text({ modelId }, session.finish());
   * }
   * // session will be disposed after the block
   * @param sessionId session id
   * @returns
   */
  async get(sessionId: string): Promise<ChatSession | null> {
    const state = await this.getState(sessionId);
    if (state) {
      return new ChatSession(
        {
          userId: state.conversation.userId,
          sessionId: state.conversation.id,
          workspaceId: state.conversation.workspaceId,
          docId: state.conversation.docId,
          turns: state.turns,
          prompt: state.prompt,
        },
        (prompt, turns, params, maxTokenSize, sessionId) =>
          this.prompts.renderSession(
            prompt,
            turns,
            params,
            maxTokenSize,
            sessionId
          ),
        async state => {
          await this.store.appendTurns(state);
          if (this.conversationPolicy.shouldScheduleTitle(state.prompt)) {
            await this.jobs.add(
              'copilot.session.generateTitle',
              { sessionId: state.sessionId },
              { priority: BACKGROUND_COPILOT_JOB_PRIORITY }
            );
          }
        }
      );
    }
    return null;
  }

  @OnJob('copilot.session.deleteDoc')
  async deleteDocSessions(doc: Jobs['copilot.session.deleteDoc']) {
    const sessionIds = await this.models.copilotSession
      .list({
        userId: undefined,
        workspaceId: doc.workspaceId,
        docId: doc.docId,
      })
      .then(s => s.map(s => [s.userId, s.id]));
    for (const [userId, sessionId] of sessionIds) {
      await this.models.copilotSession.update(
        { userId, sessionId, docId: null },
        true
      );
    }
  }

  @OnJob('copilot.session.generateTitle')
  async generateSessionTitle(job: Jobs['copilot.session.generateTitle']) {
    const { sessionId } = job;

    try {
      const state = await this.getState(sessionId);
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
        await this.promptRuntime.runText('Summary as title', {
          content: promptContent,
        })
      ).trim();

      if (!generatedTitle) {
        this.logger.warn(
          `Generated empty title for session ${sessionId}, skip updating`
        );
        return;
      }
      await this.models.copilotSession.update({
        userId: conversation.userId,
        sessionId,
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
