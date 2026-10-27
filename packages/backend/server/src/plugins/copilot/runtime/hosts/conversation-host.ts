import { BadRequestException, Injectable } from '@nestjs/common';

import {
  CopilotMessageNotFound,
  CopilotSelectedSourcesLimitExceeded,
  CopilotSessionNotFound,
  Mutex,
} from '../../../../base';
import { BackendRuntimeProvider } from '../../../../core/backend-runtime';
import { CopilotAccessService, type CopilotScopeMode } from '../../access';
import { CompatSubmissionStore } from '../../compat/submission-store';
import { ConversationPolicy } from '../../conversation/policy';
import {
  canonicalizeTurnTrace,
  promptMessageFromTurn,
  type Turn,
  turnFromChatMessage,
} from '../../core';
import type { PromptParams } from '../../providers/types';
import { ChatSession, ChatSessionService } from '../../session';
import { ChatQuerySchema } from '../../types';
import {
  ClientScopeSelectorSchema,
  type ScopeSelector,
  ScopeSelectorSchema,
  type SessionFocus,
  TurnScopeSnapshotSchema,
} from '../contracts/shared';
import { AttachmentAdmissionHost } from './attachment-admission';

export type PreparedConversationTurn = {
  messageId?: string;
  params: Record<string, string>;
  session: ChatSession;
  scopeMode: CopilotScopeMode;
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
    private readonly policy: ConversationPolicy,
    private readonly runtime: BackendRuntimeProvider,
    private readonly attachmentAdmission: AttachmentAdmissionHost,
    private readonly access: CopilotAccessService
  ) {}

  private async assertSessionAccess(
    userId: string,
    sessionId: string,
    knownSession?: ChatSession
  ): Promise<{ session: ChatSession; mode: CopilotScopeMode }> {
    const scope =
      knownSession?.config ??
      (await this.sessions.getOwnedScope(sessionId, userId));
    if (!scope) throw new CopilotSessionNotFound();
    const { workspaceId } = scope;
    const mode = await this.access.sessionResource(
      { userId, workspaceId, action: 'Workspace.Copilot' },
      [sessionId]
    );
    const session = await this.sessions.getInScope({
      sessionId,
      userId,
      workspaceId,
      personal: mode === 'personal',
    });
    if (!session) throw new CopilotSessionNotFound();
    return { session, mode };
  }

  private selectors(
    value: unknown,
    source: ScopeSelector['source']
  ): ScopeSelector[] {
    if (value === undefined) return [];
    return ClientScopeSelectorSchema.array()
      .max(100)
      .parse(value)
      .map(selector => ({ ...selector, source }));
  }

  private mergeSelectors(...groups: ScopeSelector[][]): ScopeSelector[] {
    const merged = new Map<string, ScopeSelector>();
    for (const selector of groups.flat()) {
      merged.set(`${selector.kind}:${selector.id}`, selector);
    }
    return [...merged.values()];
  }

  private async prepareMessageState(
    session: ChatSession,
    params: Record<string, any>,
    attachments: NonNullable<
      Parameters<AttachmentAdmissionHost['admitPromptAttachments']>[0]
    >,
    mode: CopilotScopeMode
  ) {
    const {
      scopeSelectors: rawSelectors,
      focusSelectors: rawFocus,
      preferredSourceIds: rawPreferred,
      ...metadata
    } = params;
    const focus: SessionFocus =
      rawFocus === undefined
        ? session.config.focus
        : { selectors: this.selectors(rawFocus, 'focus') };
    const hasWorkspaceContext =
      attachments.length > 0 ||
      focus.selectors.length > 0 ||
      (Array.isArray(rawSelectors) && rawSelectors.length > 0) ||
      (Array.isArray(rawPreferred) && rawPreferred.length > 0);
    if (mode === 'personal') {
      if (hasWorkspaceContext) {
        throw new BadRequestException(
          "Local workspaces don't support attachments or references."
        );
      }
      return {
        artifacts: [],
        focus,
        metadata,
        scopeSnapshot: TurnScopeSnapshotSchema.parse({
          version: 1,
          resolvedAt: new Date().toISOString(),
          selectors: [],
          requiredDocIds: [],
          requiredArtifactIds: [],
          preferredSourceIds: [],
          retrieval: {
            mode: 'required',
            requiredDocIds: [],
            requiredArtifactIds: [],
            preferredSourceIds: [],
          },
        }),
      };
    }
    const admitted = await this.attachmentAdmission.admitPromptAttachments(
      attachments,
      {
        userId: session.config.userId,
        workspaceId: session.config.workspaceId,
        sessionId: session.config.sessionId,
        assertCanUseAttachment: async () => {
          const access = await this.assertSessionAccess(
            session.config.userId,
            session.config.sessionId,
            session
          );
          if (access.mode !== 'canonical') {
            throw new BadRequestException(
              "Local workspaces don't support attachments or references."
            );
          }
        },
      }
    );
    if (admitted.length > 0) {
      const access = await this.assertSessionAccess(
        session.config.userId,
        session.config.sessionId,
        session
      );
      if (access.mode !== 'canonical') {
        throw new BadRequestException(
          "Local workspaces don't support attachments or references."
        );
      }
    }
    const artifacts = await Promise.all(
      admitted.map(async source => {
        const artifact = await this.runtime.putWorkspaceArtifact(
          {
            workspaceId: session.config.workspaceId,
            mimeType: source.mimeType,
            fileName: source.fileName,
            libraryOwned: false,
          },
          Buffer.from(source.data, 'base64')
        );
        return {
          artifactId: artifact.id,
          role: 'attachment',
          displayName: source.fileName,
          metadata: { mimeType: artifact.canonicalMediaType },
        };
      })
    );
    const artifactSelectors = artifacts.map(
      ({ artifactId, displayName }): ScopeSelector => ({
        kind: 'artifact',
        id: artifactId,
        name: displayName,
        source: 'message',
      })
    );
    const selectors = this.mergeSelectors(
      focus.selectors,
      this.selectors(rawSelectors, 'draft'),
      artifactSelectors
    );
    const preferredSourceIds =
      rawPreferred === undefined
        ? []
        : ScopeSelectorSchema.shape.id.array().max(100).parse(rawPreferred);
    let compiledScope: Awaited<
      ReturnType<BackendRuntimeProvider['compileTurnScope']>
    >;
    try {
      compiledScope = await this.runtime.compileTurnScope({
        workspaceId: session.config.workspaceId,
        userId: session.config.userId,
        selectors,
        preferredSourceIds,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('scope_required_document_limit_exceeded')
      ) {
        throw new CopilotSelectedSourcesLimitExceeded();
      }
      throw error;
    }
    const scopeSnapshot = TurnScopeSnapshotSchema.parse(compiledScope);
    return { artifacts, focus, metadata, scopeSnapshot };
  }

  private async loadAcceptedTurn(
    session: ChatSession,
    userId: string,
    sessionId: string,
    messageId: string,
    retry: boolean,
    mode: CopilotScopeMode
  ): Promise<Turn | undefined> {
    const accepted = await this.submissions.getAccepted(messageId, userId);
    if (!accepted) return;
    if (accepted.sessionId !== sessionId) {
      throw new CopilotMessageNotFound({ messageId });
    }

    if (retry) {
      await this.assertSessionAccess(userId, sessionId, session);
      await this.sessions.revertLatestMessage(
        sessionId,
        userId,
        false,
        session.config.workspaceId,
        mode === 'personal'
      );
      session.revertLatestMessage(false);
    }

    const existingTurn = session.findTurn(accepted.turnId);
    if (existingTurn) return existingTurn;

    const acceptedMessage = await this.sessions.getMessage(
      sessionId,
      userId,
      session.config.workspaceId,
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
    userId: string,
    sessionId: string,
    messageId: string,
    retry: boolean,
    mode: CopilotScopeMode
  ): Promise<Turn | undefined> {
    const turn = await this.sessions.findTurnByCompatSubmissionId(
      sessionId,
      userId,
      session.config.workspaceId,
      messageId
    );
    if (!turn?.id) {
      return;
    }

    if (retry) {
      await this.assertSessionAccess(userId, sessionId, session);
      await this.sessions.revertLatestMessage(
        sessionId,
        userId,
        false,
        session.config.workspaceId,
        mode === 'personal'
      );
      session.revertLatestMessage(false);
    }

    await this.submissions.markAccepted(messageId, userId, {
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
    mode: CopilotScopeMode = 'canonical'
  ): Promise<AppendedSessionMessage> {
    const quotaBackedRoutesAllowed = () => this.policy.hasQuota(userId);

    if (!messageId) {
      await this.assertSessionAccess(userId, sessionId, session);
      await this.sessions.revertLatestMessage(
        sessionId,
        userId,
        false,
        session.config.workspaceId,
        mode === 'personal'
      );
      session.revertLatestMessage(false);
      if (!session.latestUserTurn) {
        return {
          turn: session.latestUserTurn,
          quotaBackedRoutesAllowed: await quotaBackedRoutesAllowed(),
        };
      }
      return {
        turn: session.latestUserTurn,
        quotaBackedRoutesAllowed: await quotaBackedRoutesAllowed(),
      };
    }

    const acceptedTurn = await this.loadAcceptedTurn(
      session,
      userId,
      sessionId,
      messageId,
      retry,
      mode
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
      userId,
      sessionId,
      messageId,
      retry,
      mode
    );
    if (acceptedAfterLock) {
      return { turn: acceptedAfterLock, quotaBackedRoutesAllowed: true };
    }

    const durableTurn = await this.loadDurableTurn(
      session,
      userId,
      sessionId,
      messageId,
      retry,
      mode
    );
    if (durableTurn) {
      return {
        turn: durableTurn,
        quotaBackedRoutesAllowed: true,
      };
    }

    const quotaAllowed = await quotaBackedRoutesAllowed();

    const submission = await this.submissions.get(messageId, userId);
    if (
      !submission ||
      submission.userId !== userId ||
      submission.sessionId !== sessionId ||
      submission.workspaceId !== session.config.workspaceId
    ) {
      throw new CopilotMessageNotFound({ messageId });
    }

    if (retry) {
      await this.assertSessionAccess(userId, sessionId, session);
      await this.sessions.revertLatestMessage(
        sessionId,
        userId,
        true,
        session.config.workspaceId,
        mode === 'personal'
      );
      session.revertLatestMessage(true);
    }

    const prepared = await this.prepareMessageState(
      session,
      submission.params ?? {},
      submission.attachments ?? [],
      mode
    );

    await this.assertSessionAccess(userId, sessionId, session);
    const turn = await this.sessions.appendTurn({
      sessionId,
      userId: session.config.userId,
      workspaceId: session.config.workspaceId,
      personal: mode === 'personal',
      compatSubmissionId: messageId,
      focus: prepared.focus,
      artifacts: prepared.artifacts,
      turn: {
        conversationId: sessionId,
        role: 'user',
        content: submission.content ?? '',
        attachments: submission.attachments ?? [],
        metadata: prepared.metadata,
        scopeSnapshot: prepared.scopeSnapshot,
        renderTrace: [],
        toolEvents: [],
        createdAt: submission.createdAt,
      },
    });

    await this.submissions.markAccepted(messageId, userId, {
      sessionId,
      turnId: turn.id ?? '',
    });
    session.pushPersistedTurn(turn);
    return {
      turn,
      quotaBackedRoutesAllowed: quotaAllowed,
    };
  }

  async prepareTurn(
    userId: string,
    sessionId: string,
    query: Record<string, string | string[]>
  ): Promise<PreparedConversationTurn> {
    const { messageId, retry, params } = ChatQuerySchema.parse(query);
    const { session, mode } = await this.assertSessionAccess(userId, sessionId);
    const appended = await this.appendSessionMessage(
      userId,
      session,
      sessionId,
      messageId,
      retry,
      mode
    );
    const currentUserMessage = appended.turn;
    const terminal = await this.assertSessionAccess(userId, sessionId, session);

    return {
      messageId,
      params,
      session: terminal.session,
      scopeMode: terminal.mode,
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
      attachments: promptMessageFromTurn(latestTurn).attachments ?? [],
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
    const { mode } = await this.assertSessionAccess(
      session.config.userId,
      session.config.sessionId,
      session
    );
    const persisted = await this.sessions.appendTurn({
      sessionId: session.config.sessionId,
      userId: session.config.userId,
      workspaceId: session.config.workspaceId,
      personal: mode === 'personal',
      turn: assistantTurn,
    });
    session.pushPersistedTurn(persisted);
    if (
      !wasAborted &&
      this.policy.shouldScheduleTitle({ action: session.config.promptAction })
    ) {
      void this.sessions
        .generateSessionTitle({
          sessionId: session.config.sessionId,
          userId: session.config.userId,
          workspaceId: session.config.workspaceId,
        })
        .catch(() => {});
    }
    return persisted.id ?? null;
  }
}
