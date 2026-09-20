import type { CopilotChatHistoryFragment } from '@affine/graphql';

import type { AIRequestService } from '../request';
import { type AIChatScope, type AIChatTab, createDraftTab } from './state';

export type OpenSessionResult =
  | {
      type: 'opened';
      session: CopilotChatHistoryFragment;
    }
  | {
      type: 'navigate';
      target: {
        workspaceId: string;
        docId: string;
        sessionId: string;
      };
      resetTabs: true;
    };

export interface AIChatSessionStrategy {
  loadInitialSession(
    scope: AIChatScope,
    request: AIRequestService
  ): Promise<CopilotChatHistoryFragment | null>;
  createDraftSession(scope: AIChatScope): AIChatTab;
  createSession(
    scope: AIChatScope,
    request: AIRequestService,
    options?: { pinned?: boolean }
  ): Promise<CopilotChatHistoryFragment | null | undefined>;
  canOpenAsTab(
    session: CopilotChatHistoryFragment,
    scope: AIChatScope
  ): boolean;
  openSession(
    session: CopilotChatHistoryFragment,
    scope: AIChatScope
  ): OpenSessionResult;
}

export class DocAIChatSessionStrategy implements AIChatSessionStrategy {
  async loadInitialSession(scope: AIChatScope, request: AIRequestService) {
    if (scope.kind !== 'doc') return null;
    const pinned = await request.getSessions(scope.workspaceId, undefined, {
      pinned: true,
      limit: 1,
    });
    if (Array.isArray(pinned) && pinned[0]) {
      return (
        (await request.getSession(scope.workspaceId, pinned[0].sessionId)) ??
        pinned[0]
      );
    }
    if (scope.pendingSessionId) {
      return (
        (await request.getSession(scope.workspaceId, scope.pendingSessionId)) ??
        null
      );
    }

    const docSessions = await request.getSessions(
      scope.workspaceId,
      scope.docId,
      {
        action: false,
        fork: false,
        limit: 1,
      }
    );
    const session = docSessions?.[0];
    if (!session) return null;
    return (
      (await request.getSession(scope.workspaceId, session.sessionId)) ??
      session
    );
  }

  createDraftSession(scope: AIChatScope) {
    return createDraftTab(scope);
  }

  createSession(
    scope: AIChatScope,
    request: AIRequestService,
    options: { pinned?: boolean } = {}
  ) {
    if (scope.kind !== 'doc') return Promise.resolve(null);
    return request.createSessionWithHistory({
      workspaceId: scope.workspaceId,
      docId: scope.docId,
      promptName: 'Chat With AFFiNE AI',
      reuseLatestChat: false,
      pinned: options.pinned,
    });
  }

  canOpenAsTab(session: CopilotChatHistoryFragment, scope: AIChatScope) {
    return (
      scope.kind === 'doc' && (!session.docId || session.docId === scope.docId)
    );
  }

  openSession(session: CopilotChatHistoryFragment, scope: AIChatScope) {
    if (this.canOpenAsTab(session, scope)) {
      return { type: 'opened' as const, session };
    }
    if (scope.kind === 'doc' && session.docId) {
      return {
        type: 'navigate' as const,
        target: {
          workspaceId: session.workspaceId,
          docId: session.docId,
          sessionId: session.sessionId,
        },
        resetTabs: true as const,
      };
    }
    return { type: 'opened' as const, session };
  }
}

export class WorkspaceAIChatSessionStrategy implements AIChatSessionStrategy {
  async loadInitialSession(scope: AIChatScope, request: AIRequestService) {
    const sessions = await request.getSessions(scope.workspaceId, undefined, {
      pinned: true,
      limit: 1,
    });
    const session = sessions?.[0];
    if (!session) return null;
    return (
      (await request.getSession(scope.workspaceId, session.sessionId)) ??
      session
    );
  }

  createDraftSession(scope: AIChatScope) {
    return createDraftTab(scope);
  }

  createSession(
    scope: AIChatScope,
    request: AIRequestService,
    options: { pinned?: boolean } = {}
  ) {
    return request.createSessionWithHistory({
      workspaceId: scope.workspaceId,
      promptName: 'Chat With AFFiNE AI',
      reuseLatestChat: false,
      pinned: options.pinned,
    });
  }

  canOpenAsTab(session: CopilotChatHistoryFragment, scope: AIChatScope) {
    return session.workspaceId === scope.workspaceId && !session.docId;
  }

  openSession(session: CopilotChatHistoryFragment) {
    return { type: 'opened' as const, session };
  }
}

export class ForkAIChatSessionStrategy implements AIChatSessionStrategy {
  async loadInitialSession(scope: AIChatScope, request: AIRequestService) {
    if (
      scope.kind !== 'fork' &&
      scope.kind !== 'chat-block' &&
      scope.kind !== 'playground'
    ) {
      return null;
    }
    const parentSessionId =
      'parentSessionId' in scope ? scope.parentSessionId : undefined;
    if (!parentSessionId) return null;
    return (
      (await request.getSession(scope.workspaceId, parentSessionId)) ?? null
    );
  }

  createDraftSession(scope: AIChatScope) {
    return createDraftTab(scope);
  }

  async createSession(
    scope: AIChatScope,
    request: AIRequestService,
    options: { pinned?: boolean } = {}
  ) {
    const docId = 'docId' in scope ? scope.docId : undefined;
    const parentSessionId =
      'parentSessionId' in scope ? scope.parentSessionId : undefined;
    if (!parentSessionId) {
      return request.createSessionWithHistory({
        workspaceId: scope.workspaceId,
        docId,
        promptName: 'Chat With AFFiNE AI',
        reuseLatestChat: false,
        pinned: options.pinned,
      });
    }

    const latestMessageId =
      'latestMessageId' in scope ? scope.latestMessageId : undefined;
    const forkSessionId = await request.forkChat({
      workspaceId: scope.workspaceId,
      docId: docId ?? '',
      sessionId: parentSessionId,
      ...(latestMessageId ? { latestMessageId } : {}),
    });
    if (!forkSessionId) return null;
    return request.getSession(scope.workspaceId, forkSessionId);
  }

  canOpenAsTab(session: CopilotChatHistoryFragment, scope: AIChatScope) {
    return session.workspaceId === scope.workspaceId;
  }

  openSession(session: CopilotChatHistoryFragment) {
    return { type: 'opened' as const, session };
  }
}

export class ChatBlockAIChatSessionStrategy extends ForkAIChatSessionStrategy {}

export class PlaygroundAIChatSessionStrategy extends ForkAIChatSessionStrategy {}
