import '../../plugins/copilot/runtime/capability-runtime';

import ava from 'ava';

import {
  CopilotMessageNotFound,
  CopilotSessionNotFound,
  type Mutex,
} from '../../base';
import type { CompatSubmissionStore } from '../../plugins/copilot/compat/submission-store';
import type { ConversationPolicy } from '../../plugins/copilot/conversation/policy';
import type { Turn } from '../../plugins/copilot/core';
import type { AdmittedAttachmentSource } from '../../plugins/copilot/runtime/hosts/attachment-admission';
import { ConversationHost } from '../../plugins/copilot/runtime/hosts/conversation-host';
import {
  ChatSession,
  type ChatSessionService,
} from '../../plugins/copilot/session';

const test = ava;

function fixture(
  options: {
    failFirstAcceptedWrite?: boolean;
    failFirstAppend?: boolean;
    mode?: 'canonical' | 'personal';
    admittedAttachments?: AdmittedAttachmentSource[];
    revokeDuringAdmission?: boolean;
    promptAction?: string;
  } = {}
) {
  const sessionId = 'session-1';
  const token = 'submission-1';
  const durable = new Map<string, Turn>();
  const accepted = new Map<
    string,
    { userId: string; sessionId: string; turnId: string }
  >();
  const submissions = new Map([
    [
      token,
      {
        id: token,
        userId: 'user-1',
        workspaceId: 'workspace-1',
        sessionId,
        content: 'hello',
        attachments: options.admittedAttachments?.length
          ? ['data:text/plain;base64,aGVsbG8=']
          : [],
        params: {
          tone: 'brief',
          scopeSelectors: [{ kind: 'document', id: 'doc-2' }],
        },
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
  ]);
  let appendCount = 0;
  let quota = true;
  let accessAllowed = true;
  let acceptedWriteCount = 0;
  let artifactWrites = 0;
  const titleCalls: unknown[] = [];
  const chatSession = new ChatSession(
    {
      sessionId,
      userId: 'user-1',
      workspaceId: 'workspace-1',
      docId: 'doc-1',
      focus: { selectors: [] },
      prompt: {
        name: 'Chat With AFFiNE AI',
        action: options.promptAction,
        config: {},
        paramKeys: [],
        params: {},
      },
      turns: [],
    },
    () => []
  );
  const sessions = {
    getOwnedScope: async (id: string, userId: string) =>
      id === sessionId && userId === 'user-1'
        ? { workspaceId: 'workspace-1', docId: 'doc-1' }
        : undefined,
    getInScope: async (input: { sessionId: string; userId: string }) =>
      input.sessionId === sessionId && input.userId === 'user-1'
        ? chatSession
        : undefined,
    findTurnByCompatSubmissionId: async (
      _sessionId: string,
      _userId: string,
      _workspaceId: string,
      id: string
    ) => durable.get(id),
    appendTurn: async (input: { compatSubmissionId: string; turn: Turn }) => {
      appendCount += 1;
      if (options.failFirstAppend && appendCount === 1) {
        throw new Error('durable append failed');
      }
      const stored = { ...input.turn, id: `turn-${appendCount}` };
      durable.set(input.compatSubmissionId, stored);
      return stored;
    },
    getMessage: async (
      _sessionId: string,
      _userId: string,
      _workspaceId: string,
      turnId: string
    ) => [...durable.values()].find(turn => turn.id === turnId),
    revertLatestMessage: async () => {},
    generateSessionTitle: async (input: unknown) => {
      titleCalls.push(input);
    },
  } as unknown as ChatSessionService;
  const submissionStore = {
    get: async (id: string, userId: string) => {
      const value = submissions.get(id);
      return value?.userId === userId ? value : undefined;
    },
    getAccepted: async (id: string, userId: string) => {
      const value = accepted.get(id);
      return value?.userId === userId
        ? { ...value, acceptedAt: new Date('2026-01-01T00:00:00.000Z') }
        : undefined;
    },
    markAccepted: async (
      id: string,
      userId: string,
      value: { sessionId: string; turnId: string }
    ) => {
      acceptedWriteCount += 1;
      if (options.failFirstAcceptedWrite && acceptedWriteCount === 1) {
        throw new Error('accepted cache write failed');
      }
      accepted.set(id, { ...value, userId });
      submissions.delete(id);
    },
  } as unknown as CompatSubmissionStore;
  const mutex = {
    acquire: async () => ({ async [Symbol.asyncDispose]() {} }),
  } as unknown as Mutex;
  const policy = {
    hasQuota: async () => quota,
    shouldScheduleTitle: (prompt: { action?: string }) => !prompt.action,
  } as unknown as ConversationPolicy;
  const runtime = {
    putWorkspaceArtifact: async () => {
      artifactWrites++;
      return {
        id: 'artifact-1',
        canonicalMediaType: 'text/plain',
      };
    },
    compileTurnScope: async (input: {
      selectors: unknown[];
      preferredSourceIds?: string[];
    }) => ({
      version: 1,
      resolvedAt: '2026-01-01T00:00:00.000Z',
      selectors: input.selectors,
      requiredDocIds: [],
      requiredArtifactIds: [],
      preferredSourceIds: input.preferredSourceIds ?? [],
      retrieval: {
        mode: input.selectors.length ? 'required' : 'workspace',
        requiredDocIds: [],
        requiredArtifactIds: [],
        preferredSourceIds: input.preferredSourceIds ?? [],
      },
    }),
  };
  const attachmentAdmission = {
    admitPromptAttachments: async () => {
      if (options.revokeDuringAdmission) accessAllowed = false;
      return options.admittedAttachments ?? [];
    },
  };

  return {
    host: new ConversationHost(
      sessions,
      submissionStore,
      mutex,
      policy,
      runtime as never,
      attachmentAdmission as never,
      {
        sessionResource: async () => {
          if (!accessAllowed) throw new Error('permission denied');
          return options.mode ?? 'canonical';
        },
      } as never
    ),
    sessionId,
    token,
    durable,
    accepted,
    submissions,
    session: chatSession,
    appendCount: () => appendCount,
    artifactWrites: () => artifactWrites,
    titleCalls,
    setQuota: (value: boolean) => {
      quota = value;
    },
    revokeAccess: () => {
      accessAllowed = false;
    },
  };
}

test('compat submission becomes one durable user turn and replays idempotently', async t => {
  const state = fixture();

  const first = await state.host.prepareTurn('user-1', state.sessionId, {
    messageId: state.token,
  });
  t.is(first.latestTurn?.content, 'hello');
  t.deepEqual(first.latestTurn?.metadata, { tone: 'brief' });
  t.deepEqual(first.latestTurn?.scopeSnapshot?.selectors, [
    { kind: 'document', id: 'doc-2', source: 'draft' },
  ]);
  t.is(state.appendCount(), 1);
  t.false(state.submissions.has(state.token));
  t.truthy(state.accepted.get(state.token));

  state.setQuota(false);
  const replay = await state.host.prepareTurn('user-1', state.sessionId, {
    messageId: state.token,
  });
  t.is(replay.latestTurn?.id, first.latestTurn?.id);
  t.true(replay.quotaBackedRoutesAllowed);
  t.is(state.appendCount(), 1);
});

test('durable compat turn recovers after accepted-cache write failure', async t => {
  const state = fixture({ failFirstAcceptedWrite: true });

  await t.throwsAsync(
    state.host.prepareTurn('user-1', state.sessionId, {
      messageId: state.token,
    }),
    { message: 'accepted cache write failed' }
  );
  t.is(state.appendCount(), 1);
  t.truthy(state.durable.get(state.token));

  const recovered = await state.host.prepareTurn('user-1', state.sessionId, {
    messageId: state.token,
  });
  t.is(recovered.latestTurn?.id, state.durable.get(state.token)?.id);
  t.is(state.appendCount(), 1);
  t.truthy(state.accepted.get(state.token));
});

test('compat submission remains retryable when durable append fails', async t => {
  const state = fixture({ failFirstAppend: true });

  await t.throwsAsync(
    state.host.prepareTurn('user-1', state.sessionId, {
      messageId: state.token,
    }),
    { message: 'durable append failed' }
  );
  t.true(state.submissions.has(state.token));
  t.false(state.accepted.has(state.token));

  const recovered = await state.host.prepareTurn('user-1', state.sessionId, {
    messageId: state.token,
  });
  t.is(recovered.latestTurn?.content, 'hello');
  t.is(state.durable.size, 1);
});

test('compat submission cannot be consumed by another session', async t => {
  const state = fixture();
  const other = fixture();
  other.submissions.set(state.token, {
    id: state.token,
    userId: 'user-1',
    workspaceId: 'workspace-1',
    sessionId: 'session-other',
    content: 'secret',
    attachments: [],
    params: { tone: 'brief', scopeSelectors: [] },
    createdAt: new Date(),
  });

  await t.throwsAsync(
    other.host.prepareTurn('user-1', other.sessionId, {
      messageId: state.token,
    }),
    { instanceOf: CopilotMessageNotFound }
  );
  await t.throwsAsync(
    state.host.prepareTurn('user-2', state.sessionId, {
      messageId: state.token,
    }),
    { instanceOf: CopilotSessionNotFound }
  );
  t.is(other.appendCount(), 0);
});

test('direct conversation rejects revoked canonical access before durable append', async t => {
  const state = fixture();
  state.revokeAccess();

  await t.throwsAsync(
    state.host.prepareTurn('user-1', state.sessionId, {
      messageId: state.token,
    }),
    { message: 'permission denied' }
  );
  t.is(state.appendCount(), 0);
  t.true(state.submissions.has(state.token));
});

test('workspace context fails closed for personal scope and revoked canonical access', async t => {
  const personal = fixture({ mode: 'personal' });
  const personalError = await t.throwsAsync(
    personal.host.prepareTurn('user-1', personal.sessionId, {
      messageId: personal.token,
    })
  );

  const canonical = fixture({
    admittedAttachments: [
      {
        id: 'attachment-1',
        kind: 'bytes',
        mimeType: 'text/plain',
        size: 5,
        fileName: 'note.txt',
        hash: 'hash-1',
        data: 'aGVsbG8=',
        encoding: 'base64',
      },
    ],
    revokeDuringAdmission: true,
  });
  const canonicalError = await t.throwsAsync(
    canonical.host.prepareTurn('user-1', canonical.sessionId, {
      messageId: canonical.token,
    })
  );

  t.snapshot({
    personal: {
      error: personalError?.message,
      artifactWrites: personal.artifactWrites(),
      durableAppends: personal.appendCount(),
    },
    canonical: {
      error: canonicalError?.message,
      artifactWrites: canonical.artifactWrites(),
      durableAppends: canonical.appendCount(),
    },
  });
});

test('assistant persistence rechecks access and schedules eligible titles', async t => {
  const state = fixture();
  state.revokeAccess();

  await t.throwsAsync(
    state.host.persistAssistantTurn(
      state.session,
      {
        conversationId: state.session.config.sessionId,
        role: 'assistant',
        content: 'must not persist',
        attachments: [],
        metadata: {},
        renderTrace: [],
        toolEvents: [],
        createdAt: new Date(),
      },
      false
    ),
    { message: 'permission denied' }
  );
  t.is(state.appendCount(), 0);

  const eligible = fixture();
  const assistantTurn = {
    conversationId: eligible.sessionId,
    role: 'assistant' as const,
    content: 'answer',
    attachments: [],
    metadata: {},
    renderTrace: [],
    toolEvents: [],
    createdAt: new Date(),
  };
  await eligible.host.persistAssistantTurn(
    eligible.session,
    assistantTurn,
    false
  );
  await eligible.host.persistAssistantTurn(
    eligible.session,
    { ...assistantTurn, content: 'aborted' },
    true
  );

  const action = fixture({ promptAction: 'edit' });
  await action.host.persistAssistantTurn(
    action.session,
    { ...assistantTurn, conversationId: action.sessionId },
    false
  );

  t.deepEqual(eligible.titleCalls, [
    {
      sessionId: 'session-1',
      userId: 'user-1',
      workspaceId: 'workspace-1',
    },
  ]);
  t.deepEqual(action.titleCalls, []);
});
