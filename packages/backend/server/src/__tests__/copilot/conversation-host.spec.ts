import '../../plugins/copilot/runtime/capability-runtime';

import ava from 'ava';

import { CopilotMessageNotFound, type Mutex } from '../../base';
import type { CompatSubmissionStore } from '../../plugins/copilot/compat/submission-store';
import type { ConversationPolicy } from '../../plugins/copilot/conversation/policy';
import type { Turn } from '../../plugins/copilot/core';
import { ConversationHost } from '../../plugins/copilot/runtime/hosts/conversation-host';
import {
  ChatSession,
  type ChatSessionService,
} from '../../plugins/copilot/session';

const test = ava;

function fixture(
  options: { failFirstAcceptedWrite?: boolean; failFirstAppend?: boolean } = {}
) {
  const sessionId = 'session-1';
  const token = 'submission-1';
  const durable = new Map<string, Turn>();
  const accepted = new Map<string, { sessionId: string; turnId: string }>();
  const submissions = new Map([
    [
      token,
      {
        id: token,
        sessionId,
        content: 'hello',
        attachments: [],
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
  let acceptedWriteCount = 0;
  const chatSession = new ChatSession(
    {
      sessionId,
      userId: 'user-1',
      workspaceId: 'workspace-1',
      docId: 'doc-1',
      focus: { selectors: [] },
      prompt: {
        name: 'Chat With AFFiNE AI',
        config: {},
        paramKeys: [],
        params: {},
      },
      turns: [],
    },
    () => []
  );
  const sessions = {
    get: async (id: string) => (id === sessionId ? chatSession : undefined),
    findTurnByCompatSubmissionId: async (_sessionId: string, id: string) =>
      durable.get(id),
    appendTurn: async (input: { compatSubmissionId: string; turn: Turn }) => {
      appendCount += 1;
      if (options.failFirstAppend && appendCount === 1) {
        throw new Error('durable append failed');
      }
      const stored = { ...input.turn, id: `turn-${appendCount}` };
      durable.set(input.compatSubmissionId, stored);
      return stored;
    },
    getMessage: async (_sessionId: string, turnId: string) =>
      [...durable.values()].find(turn => turn.id === turnId),
    revertLatestMessage: async () => {},
  } as unknown as ChatSessionService;
  const submissionStore = {
    get: async (id: string) => submissions.get(id),
    getAccepted: async (id: string) => {
      const value = accepted.get(id);
      return value
        ? { ...value, acceptedAt: new Date('2026-01-01T00:00:00.000Z') }
        : undefined;
    },
    markAccepted: async (
      id: string,
      value: { sessionId: string; turnId: string }
    ) => {
      acceptedWriteCount += 1;
      if (options.failFirstAcceptedWrite && acceptedWriteCount === 1) {
        throw new Error('accepted cache write failed');
      }
      accepted.set(id, value);
      submissions.delete(id);
    },
  } as unknown as CompatSubmissionStore;
  const mutex = {
    acquire: async () => ({ async [Symbol.asyncDispose]() {} }),
  } as unknown as Mutex;
  const policy = {
    hasQuota: async () => quota,
  } as unknown as ConversationPolicy;
  const runtime = {
    putWorkspaceArtifact: async () => {
      throw new Error('unexpected attachment');
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
    admitPromptAttachments: async () => [],
  };

  return {
    host: new ConversationHost(
      sessions,
      submissionStore,
      mutex,
      policy,
      runtime as never,
      attachmentAdmission as never
    ),
    sessionId,
    token,
    durable,
    accepted,
    submissions,
    appendCount: () => appendCount,
    setQuota: (value: boolean) => {
      quota = value;
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
  t.is(other.appendCount(), 0);
});
