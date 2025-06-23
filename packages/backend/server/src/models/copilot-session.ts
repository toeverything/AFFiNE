import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { AiPromptRole, Prisma } from '@prisma/client';
import { omit } from 'lodash-es';

import {
  CopilotPromptInvalid,
  CopilotSessionDeleted,
  CopilotSessionInvalidInput,
  CopilotSessionNotFound,
} from '../base';
import { BaseModel } from './base';

export enum SessionType {
  Workspace = 'workspace', // docId is null and pinned is false
  Pinned = 'pinned', // pinned is true
  Doc = 'doc', // docId points to specific document
}

type ChatAttachment = { attachment: string; mimeType: string } | string;

type ChatStreamObject = {
  type: 'text-delta' | 'reasoning' | 'tool-call' | 'tool-result';
  textDelta?: string;
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, any>;
  result?: any;
};

type ChatMessage = {
  id?: string | undefined;
  role: 'system' | 'assistant' | 'user';
  content: string;
  attachments?: ChatAttachment[] | null;
  params?: Record<string, any> | null;
  streamObjects?: ChatStreamObject[] | null;
  createdAt: Date;
};

type ChatSession = {
  sessionId: string;
  workspaceId: string;
  docId?: string | null;
  pinned?: boolean;
  messages?: ChatMessage[];
  // connect ids
  userId: string;
  promptName: string;
  promptAction: string | null;
  parentSessionId?: string | null;
};

export type UpdateChatSessionData = Partial<
  Pick<ChatSession, 'docId' | 'pinned' | 'promptName'>
>;
export type UpdateChatSession = Pick<ChatSession, 'userId' | 'sessionId'> &
  UpdateChatSessionData;

export type ListSessionOptions = {
  userId: string;
  sessionId?: string;
  workspaceId?: string;
  docId?: string;
  action?: boolean;
  fork?: boolean;
  limit?: number;
  skip?: number;
  sessionOrder?: 'asc' | 'desc';
  messageOrder?: 'asc' | 'desc';

  // extra condition
  withPrompt?: boolean;
  withMessages?: boolean;
};

@Injectable()
export class CopilotSessionModel extends BaseModel {
  getSessionType(session: Pick<ChatSession, 'docId' | 'pinned'>): SessionType {
    if (session.pinned) return SessionType.Pinned;
    if (!session.docId) return SessionType.Workspace;
    return SessionType.Doc;
  }

  checkSessionPrompt(
    session: Pick<ChatSession, 'docId' | 'pinned'>,
    promptName: string,
    promptAction: string | undefined
  ): boolean {
    const sessionType = this.getSessionType(session);

    // workspace and pinned sessions cannot use action prompts
    if (
      [SessionType.Workspace, SessionType.Pinned].includes(sessionType) &&
      !!promptAction?.trim()
    ) {
      throw new CopilotPromptInvalid(
        `${promptName} are not allowed for ${sessionType} sessions`
      );
    }

    return true;
  }

  // NOTE: just for test, remove it after copilot prompt model is ready
  async createPrompt(name: string, model: string, action?: string) {
    await this.db.aiPrompt.create({
      data: { name, model, action: action ?? null },
    });
  }

  @Transactional()
  async create(state: ChatSession) {
    if (state.pinned) {
      await this.unpin(state.workspaceId, state.userId);
    }

    const row = await this.db.aiSession.create({
      data: {
        id: state.sessionId,
        workspaceId: state.workspaceId,
        docId: state.docId,
        pinned: state.pinned ?? false,
        // connect
        userId: state.userId,
        promptName: state.promptName,
        promptAction: state.promptAction,
        parentSessionId: state.parentSessionId,
      },
    });
    return row;
  }

  @Transactional()
  async has(
    sessionId: string,
    userId: string,
    params?: Prisma.AiSessionCountArgs['where']
  ) {
    return await this.db.aiSession
      .count({ where: { id: sessionId, userId, ...params } })
      .then(c => c > 0);
  }

  @Transactional()
  async getChatSessionId(
    state: Omit<ChatSession, 'promptName' | 'promptAction'>
  ) {
    const extraCondition: Record<string, any> = {};
    if (state.parentSessionId) {
      // also check session id if provided session is forked session
      extraCondition.id = state.sessionId;
      extraCondition.parentSessionId = state.parentSessionId;
    }

    const session = await this.db.aiSession.findFirst({
      where: {
        userId: state.userId,
        workspaceId: state.workspaceId,
        docId: state.docId,
        parentSessionId: null,
        prompt: { action: { equals: null } },
        ...extraCondition,
      },
      select: { id: true, deletedAt: true },
    });
    if (session?.deletedAt) throw new CopilotSessionDeleted();
    return session?.id;
  }

  @Transactional()
  async getExists<Select extends Prisma.AiSessionSelect>(
    sessionId: string,
    select?: Select,
    where?: Omit<Prisma.AiSessionWhereInput, 'id' | 'deletedAt'>
  ) {
    return (await this.db.aiSession.findUnique({
      where: { ...where, id: sessionId, deletedAt: null },
      select,
    })) as Prisma.AiSessionGetPayload<{ select: Select }>;
  }

  @Transactional()
  async get(sessionId: string) {
    return await this.getExists(sessionId, {
      id: true,
      userId: true,
      workspaceId: true,
      docId: true,
      pinned: true,
      parentSessionId: true,
      messages: {
        select: {
          id: true,
          role: true,
          content: true,
          attachments: true,
          params: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      promptName: true,
    });
  }

  async list(options: ListSessionOptions) {
    const { userId, sessionId, workspaceId, docId } = options;

    const extraCondition = [];

    if (!options?.action && options?.fork) {
      // only query forked session if fork == true and action == false
      extraCondition.push({
        userId: { not: userId },
        workspaceId: workspaceId,
        docId: docId ?? null,
        id: sessionId ? { equals: sessionId } : undefined,
        prompt: {
          action: options.action ? { not: null } : null,
        },
        // should only find forked session
        parentSessionId: { not: null },
        deletedAt: null,
      });
    }

    return await this.db.aiSession.findMany({
      where: {
        OR: [
          {
            userId,
            workspaceId,
            docId: docId ?? null,
            id: sessionId ? { equals: sessionId } : undefined,
            deletedAt: null,
          },
          ...extraCondition,
        ],
      },
      select: {
        id: true,
        userId: true,
        workspaceId: true,
        docId: true,
        parentSessionId: true,
        pinned: true,
        promptName: true,
        tokenCost: true,
        createdAt: true,
        messages: options.withMessages
          ? {
              select: {
                id: true,
                role: true,
                content: true,
                attachments: true,
                params: true,
                streamObjects: true,
                createdAt: true,
              },
              orderBy: {
                // message order is asc by default
                createdAt: options?.messageOrder === 'desc' ? 'desc' : 'asc',
              },
            }
          : false,
      },
      take: options?.limit,
      skip: options?.skip,
      orderBy: {
        // session order is desc by default
        createdAt: options?.sessionOrder === 'asc' ? 'asc' : 'desc',
      },
    });
  }

  @Transactional()
  async unpin(workspaceId: string, userId: string): Promise<boolean> {
    const { count } = await this.db.aiSession.updateMany({
      where: { userId, workspaceId, pinned: true, deletedAt: null },
      data: { pinned: false },
    });

    return count > 0;
  }

  @Transactional()
  async update(
    userId: string,
    sessionId: string,
    data: UpdateChatSessionData
  ): Promise<string> {
    const session = await this.getExists(
      sessionId,
      {
        id: true,
        workspaceId: true,
        docId: true,
        parentSessionId: true,
        pinned: true,
        prompt: true,
      },
      { userId }
    );
    if (!session) {
      throw new CopilotSessionNotFound();
    }

    // not allow to update action session
    if (session.prompt.action) {
      throw new CopilotSessionInvalidInput(
        `Cannot update action: ${session.id}`
      );
    } else if (data.docId && session.parentSessionId) {
      throw new CopilotSessionInvalidInput(
        `Cannot update docId for forked session: ${session.id}`
      );
    }

    if (data.promptName) {
      const prompt = await this.db.aiPrompt.findFirst({
        where: { name: data.promptName },
      });
      // always not allow to update to action prompt
      if (!prompt || prompt.action) {
        throw new CopilotSessionInvalidInput(
          `Prompt ${data.promptName} not found or not available for session ${sessionId}`
        );
      }
    }
    if (data.pinned && data.pinned !== session.pinned) {
      // if pin the session, unpin exists session in the workspace
      await this.unpin(session.workspaceId, userId);
    }

    await this.db.aiSession.update({ where: { id: sessionId }, data });

    return sessionId;
  }

  @Transactional()
  async getMessages(
    sessionId: string,
    select?: Prisma.AiSessionMessageSelect,
    orderBy?: Prisma.AiSessionMessageOrderByWithRelationInput
  ) {
    return this.db.aiSessionMessage.findMany({
      where: { sessionId },
      select,
      orderBy: orderBy ?? { createdAt: 'asc' },
    });
  }

  @Transactional()
  async setMessages(
    sessionId: string,
    messages: ChatMessage[],
    tokenCost: number
  ) {
    await this.db.aiSessionMessage.createMany({
      data: messages.map(m => ({
        ...m,
        attachments: m.attachments || undefined,
        params: omit(m.params, ['docs']) || undefined,
        streamObjects: m.streamObjects || undefined,
        sessionId,
      })),
    });

    // only count message generated by user
    const userMessages = messages.filter(m => m.role === 'user');
    await this.db.aiSession.update({
      where: { id: sessionId },
      data: {
        messageCost: { increment: userMessages.length },
        tokenCost: { increment: tokenCost },
      },
    });
  }

  @Transactional()
  async revertLatestMessage(
    sessionId: string,
    removeLatestUserMessage: boolean
  ) {
    const id = await this.getExists(sessionId, { id: true }).then(
      session => session?.id
    );
    if (!id) {
      throw new CopilotSessionNotFound();
    }
    const ids = await this.getMessages(id, { id: true, role: true }).then(
      roles =>
        roles
          .slice(
            roles.findLastIndex(({ role }) => role === AiPromptRole.user) +
              (removeLatestUserMessage ? 0 : 1)
          )
          .map(({ id }) => id)
    );
    if (ids.length) {
      await this.db.aiSessionMessage.deleteMany({ where: { id: { in: ids } } });
    }
  }
}
