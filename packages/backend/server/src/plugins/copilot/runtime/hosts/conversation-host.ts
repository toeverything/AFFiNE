import { Injectable } from '@nestjs/common';

import {
  CopilotMessageNotFound,
  CopilotSessionNotFound,
  Mutex,
} from '../../../../base';
import { CopilotAccessPolicy } from '../../access';
import { CompatSubmissionStore } from '../../compat/submission-store';
import {
  canonicalizeTurnTrace,
  type Turn,
  turnFromChatMessage,
} from '../../core';
import type { PromptParams } from '../../providers/types';
import { ChatSession, ChatSessionService } from '../../session';
import { ChatQuerySchema } from '../../types';

export type PreparedConversationTurn = {
  messageId?: string;
  params: Record<string, string>;
  session: ChatSession;
  latestTurn?: Turn;
  quotaBackedRoutesAllowed?: boolean;
};

type AppendedSessionMessage = {
  turn?: Turn;
  quotaBackedRoutesAllowed?: boolean;
};

@Injectable()
export class ConversationHost {
  constructor(
    private readonly sessions: ChatSessionService,
    private readonly submissions: CompatSubmissionStore,
    private readonly mutex: Mutex,
    private readonly access: CopilotAccessPolicy
  ) {}

  private async loadAcceptedTurn(
    session: ChatSession,
    sessionId: string,
    messageId: string,
    retry: boolean
  ): Promise<Turn | undefined> {
    const accepted = await this.submissions.getAccepted(messageId);
    if (!accepted) return;
    if (accepted.sessionId !== sessionId) {
      throw new CopilotMessageNotFound({ messageId });
    }

    if (retry) {
      await this.sessions.revertLatestMessage(sessionId, false);
      session.revertLatestMessage(false);
    }

    const existingTurn = session.findTurn(accepted.turnId);
    if (existingTurn) return existingTurn;

    const acceptedMessage = await this.sessions.getMessage(
      sessionId,
      accepted.turnId
    );
    if (acceptedMessage.role !== 'user') {
      throw new CopilotMessageNotFound({ messageId: accepted.turnId });
    }

    const turn = turnFromChatMessage(acceptedMessage, sessionId);
    session.pushPersistedTurn(turn);
    return turn;
  }

  private async loadDurableTurn(
    session: ChatSession,
    sessionId: string,
    messageId: string,
    retry: boolean
  ): Promise<Turn | undefined> {
    const turn = await this.sessions.findTurnByCompatSubmissionId(
      sessionId,
      messageId
    );
    if (!turn?.id) {
      return;
    }

    if (retry) {
      await this.sessions.revertLatestMessage(sessionId, false);
      session.revertLatestMessage(false);
    }

    await this.submissions.markAccepted(messageId, {
      sessionId,
      turnId: turn.id,
    });

    const existingTurn = session.findTurn(turn.id);
    if (existingTurn) {
      return existingTurn;
    }

    session.pushPersistedTurn(turn);
    return turn;
  }

  private async appendSessionMessage(
    userId: string,
    session: ChatSession,
    sessionId: string,
    messageId?: string,
    retry = false,
    byokLeaseId?: string
  ): Promise<AppendedSessionMessage> {
    const resolveChatRouteAccess = () =>
      this.access.resolveTurnRouteAccess({
        userId,
        workspaceId: session.config.workspaceId,
        byokLeaseId,
        featureKind: 'chat',
      });

    if (!messageId) {
      await this.sessions.revertLatestMessage(sessionId, false);
      session.revertLatestMessage(false);
      if (!session.latestUserTurn) {
        const routeAccess = await resolveChatRouteAccess();
        return {
          turn: session.latestUserTurn,
          quotaBackedRoutesAllowed: routeAccess.quotaBackedRoutesAllowed,
        };
      }
      const routeAccess = await resolveChatRouteAccess();
      return {
        turn: session.latestUserTurn,
        quotaBackedRoutesAllowed: routeAccess.quotaBackedRoutesAllowed,
      };
    }

    const acceptedTurn = await this.loadAcceptedTurn(
      session,
      sessionId,
      messageId,
      retry
    );
    if (acceptedTurn) {
      return { turn: acceptedTurn, quotaBackedRoutesAllowed: true };
    }

    await using lock = await this.mutex.acquire(
      `copilot:submission:${messageId}`
    );
    if (!lock) {
      throw new CopilotMessageNotFound({ messageId });
    }

    const acceptedAfterLock = await this.loadAcceptedTurn(
      session,
      sessionId,
      messageId,
      retry
    );
    if (acceptedAfterLock) {
      return { turn: acceptedAfterLock, quotaBackedRoutesAllowed: true };
    }

    const durableTurn = await this.loadDurableTurn(
      session,
      sessionId,
      messageId,
      retry
    );
    if (durableTurn) {
      return {
        turn: durableTurn,
        quotaBackedRoutesAllowed: true,
      };
    }

    const routeAccess = await resolveChatRouteAccess();

    const submission = await this.submissions.get(messageId);
    if (!submission || submission.sessionId !== sessionId) {
      throw new CopilotMessageNotFound({ messageId });
    }

    if (retry) {
      await this.sessions.revertLatestMessage(sessionId, true);
      session.revertLatestMessage(true);
    }

    const turn = await this.sessions.appendTurn({
      sessionId,
      userId: session.config.userId,
      prompt: { model: session.model },
      compatSubmissionId: messageId,
      turn: {
        conversationId: sessionId,
        role: 'user',
        content: submission.content ?? '',
        attachments: submission.attachments ?? [],
        metadata: submission.params ?? {},
        renderTrace: [],
        toolEvents: [],
        createdAt: submission.createdAt,
      },
    });

    await this.submissions.markAccepted(messageId, {
      sessionId,
      turnId: turn.id ?? '',
    });
    session.pushPersistedTurn(turn);
    return {
      turn,
      quotaBackedRoutesAllowed: routeAccess.quotaBackedRoutesAllowed,
    };
  }

  async prepareTurn(
    userId: string,
    sessionId: string,
    query: Record<string, string | string[]>
  ): Promise<PreparedConversationTurn> {
    const { messageId, retry, params, byokLeaseId } =
      ChatQuerySchema.parse(query);
    const session = await this.sessions.get(sessionId);
    if (!session || session.config.userId !== userId) {
      throw new CopilotSessionNotFound();
    }
    const appended = await this.appendSessionMessage(
      userId,
      session,
      sessionId,
      messageId,
      retry,
      byokLeaseId
    );
    const currentUserMessage =
      session.stashTurns.findLast(turn => turn.role === 'user') ??
      appended.turn;

    return {
      messageId,
      params,
      session,
      latestTurn: currentUserMessage,
      quotaBackedRoutesAllowed: appended.quotaBackedRoutesAllowed,
    };
  }

  buildLatestTurnPromptParams(latestTurn?: Turn): PromptParams {
    if (!latestTurn) {
      return {};
    }

    return {
      ...latestTurn.metadata,
      content: latestTurn.content,
      attachments: latestTurn.attachments,
    };
  }

  async persistAssistantTurn(
    session: ChatSession,
    turn: Turn,
    wasAborted: boolean
  ) {
    const trace = wasAborted
      ? { renderTrace: [], toolEvents: [] }
      : canonicalizeTurnTrace(turn);
    const assistantTurn = {
      ...turn,
      content: wasAborted ? '> Request aborted' : turn.content,
      attachments: wasAborted ? [] : turn.attachments,
      renderTrace: trace.renderTrace,
      toolEvents: trace.toolEvents,
      metadata: wasAborted ? {} : turn.metadata,
    };
    const persisted = await this.sessions.appendTurn({
      sessionId: session.config.sessionId,
      userId: session.config.userId,
      prompt: { model: session.model },
      turn: assistantTurn,
    });
    session.pushPersistedTurn(persisted);
    return persisted.id ?? null;
  }
}
