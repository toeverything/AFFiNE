import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import { AiPromptRole, Prisma } from '@prisma/client';
import { omit } from 'lodash-es';

import {
  CopilotPromptInvalid,
  CopilotSessionDeleted,
  CopilotSessionNotFound,
} from '../base';
import { BaseModel } from './base';

// Session type definitions based on docId and workspaceId relationship
export enum SessionType {
  WORKSPACE = 'workspace', // docId is null/undefined
  PINNED = 'pinned', // docId equals workspaceId
  DOC = 'doc', // docId differs from workspaceId
}

type ChatAttachment = { attachment: string; mimeType: string } | string;

type ChatMessage = {
  id?: string | undefined;
  role: 'system' | 'assistant' | 'user';
  content: string;
  attachments?: ChatAttachment[] | null;
  params?: Record<string, any> | null;
  createdAt: Date;
};

type ChatSession = {
  sessionId: string;
  workspaceId: string;
  docId?: string | null;
  messages?: ChatMessage[];
  // connect ids
  userId: string;
  promptName: string;
  parentSessionId?: string | null;
};

export type ListSessionOptions = {
  sessionId: string | undefined;
  action: boolean | undefined;
  fork: boolean | undefined;
  limit: number | undefined;
  skip: number | undefined;
  sessionOrder: 'asc' | 'desc' | undefined;
  messageOrder: 'asc' | 'desc' | undefined;
};

@Injectable()
export class CopilotSessionModel extends BaseModel {
  /**
   * Determine session type based on docId and workspaceId relationship
   * @param docId - Document ID from session
   * @param workspaceId - Workspace ID from session
   * @returns SessionType enum value
   */
  getSessionType(docId?: string | null, workspaceId?: string): SessionType {
    if (!docId) return SessionType.WORKSPACE;
    if (docId === workspaceId) return SessionType.PINNED;
    return SessionType.DOC;
  }

  checkSessionPrompt(
    session: Pick<ChatSession, 'docId' | 'workspaceId'>,
    promptName: string,
    promptAction: string | undefined
  ): boolean {
    const sessionType = this.getSessionType(session.docId, session.workspaceId);

    // workspace and pinned sessions cannot use action prompts
    if (
      [SessionType.WORKSPACE, SessionType.PINNED].includes(sessionType) &&
      !!promptAction?.trim()
    ) {
      throw new CopilotPromptInvalid(
        `${promptName} are not allowed for ${sessionType} sessions`
      );
    }

    return true;
  }

  // NOTE: just for test, remove it after copilot prompt model is ready
  async createPrompt(name: string, model: string) {
    await this.db.aiPrompt.create({
      data: { name, model },
    });
  }

  async create(state: ChatSession) {
    const row = await this.db.aiSession.create({
      data: {
        id: state.sessionId,
        workspaceId: state.workspaceId,
        docId: state.docId,
        // connect
        userId: state.userId,
        promptName: state.promptName,
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
  async getChatSessionId(state: Omit<ChatSession, 'promptName'>) {
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
    select?: Select
  ) {
    return (await this.db.aiSession.findUnique({
      where: { id: sessionId, deletedAt: null },
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

  async list(
    userId: string,
    workspaceId?: string,
    docId?: string,
    options?: ListSessionOptions
  ) {
    const extraCondition = [];

    if (!options?.action && options?.fork) {
      // only query forked session if fork == true and action == false
      extraCondition.push({
        userId: { not: userId },
        workspaceId: workspaceId,
        docId: docId ?? null,
        id: options?.sessionId ? { equals: options.sessionId } : undefined,
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
            workspaceId: workspaceId,
            docId: docId ?? null,
            id: options?.sessionId ? { equals: options.sessionId } : undefined,
            deletedAt: null,
          },
          ...extraCondition,
        ],
      },
      select: {
        id: true,
        userId: true,
        docId: true,
        promptName: true,
        tokenCost: true,
        createdAt: true,
        messages: {
          select: {
            id: true,
            role: true,
            content: true,
            attachments: true,
            params: true,
            createdAt: true,
          },
          orderBy: {
            // message order is asc by default
            createdAt: options?.messageOrder === 'desc' ? 'desc' : 'asc',
          },
        },
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
  async updatePrompt(
    userId: string,
    sessionId: string,
    promptName: string
  ): Promise<string> {
    const haveSession = await this.has(sessionId, userId, {
      prompt: { action: null },
    });
    if (haveSession) {
      await this.db.aiSession.update({
        where: { id: sessionId },
        data: { promptName },
      });
    }
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
