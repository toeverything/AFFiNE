import test from 'ava';
import Sinon from 'sinon';

import { type Models } from '../../models';
import { CopilotAccessPolicy } from '../../plugins/copilot/access';
import type { ByokFeatureKind } from '../../plugins/copilot/byok/types';
import { HistoryAttachmentUrlProjector } from '../../plugins/copilot/compat/history-attachment-url-projector';
import { CompatHistoryProjector } from '../../plugins/copilot/compat/history-projector';
import { HistoryPromptPreloadProjector } from '../../plugins/copilot/compat/history-prompt-preload-projector';
import { HistoryVisibilityPolicy } from '../../plugins/copilot/compat/history-visibility-policy';
import { ConversationPolicy } from '../../plugins/copilot/conversation/policy';
import type { Turn } from '../../plugins/copilot/core';
import { CopilotEmbeddingClientService } from '../../plugins/copilot/embedding/client';
import { CopilotProviderType } from '../../plugins/copilot/providers/types';
import {
  projectActionResultToAssistantTurn,
  summarizeActionResult,
} from '../../plugins/copilot/runtime/action-output-projector';
import { ActionRuntimeBridge } from '../../plugins/copilot/runtime/action-runtime-bridge';
import {
  ActionStreamHost,
  projectActionEventToChatEvent,
} from '../../plugins/copilot/runtime/hosts/action-stream-host';
import {
  admittedAttachmentToPromptAttachment,
  AttachmentAdmissionHost,
} from '../../plugins/copilot/runtime/hosts/attachment-admission';
import {
  planAdmittedAttachmentMaterialization,
  planHostUrlAttachmentMaterialization,
} from '../../plugins/copilot/runtime/hosts/attachment-materialization-planner';
import {
  AttachmentMaterializer,
  resolveAttachmentFetchUrl,
} from '../../plugins/copilot/runtime/hosts/attachment-materializer';
import { ConversationHost } from '../../plugins/copilot/runtime/hosts/conversation-host';
import { ImageResultHost } from '../../plugins/copilot/runtime/hosts/image-result-host';
import { ResponsePostprocessor } from '../../plugins/copilot/runtime/hosts/response-postprocessor';
import { TurnPersistence } from '../../plugins/copilot/runtime/hosts/turn-persistence';
import { ToolRuntime } from '../../plugins/copilot/runtime/tool-runtime';

function stubTurnPersistence(
  persistProjectedResult: Sinon.SinonStub = Sinon.stub().resolves(null)
) {
  return {
    persistProjectedResult,
  } as unknown as TurnPersistence;
}

function stubConversationSession(latestUserTurn?: unknown) {
  return {
    config: {
      sessionId: 'session-1',
      userId: 'user-1',
      workspaceId: 'workspace-1',
    },
    model: 'gpt-4o-mini',
    stashTurns: latestUserTurn ? [latestUserTurn] : [],
    latestUserTurn,
    revertLatestMessage: Sinon.stub(),
  };
}

test('ConversationPolicy should treat zero quota limit as exhausted', async t => {
  const policy = new ConversationPolicy(
    {
      userFeature: { has: Sinon.stub().resolves(false) },
      copilotSession: { countUserMessages: Sinon.stub().resolves(0) },
    } as any,
    {
      getUserQuota: Sinon.stub().resolves({ copilotActionLimit: 0 }),
    } as any
  );

  t.false(await policy.hasQuota('user-1'));
  await t.throwsAsync(policy.checkQuota('user-1'));
});

type TurnRouteAccessCase = {
  name: string;
  profiles: Array<{ id: string }>;
  featureKind?: 'embedding' | 'rerank' | 'workspace_indexing';
  byokLeaseId?: string;
  quotaBackedRoutesAllowed?: boolean;
  expectedQuotaCalls: number;
  expectedError?: string;
  expectedQuotaBackedRoutesAllowed?: boolean;
};

const turnRouteAccessCases: TurnRouteAccessCase[] = [
  {
    name: 'checks quota when BYOK does not cover the route',
    profiles: [],
    expectedQuotaCalls: 1,
    expectedError: 'quota exceeded',
  },
  {
    name: 'skips quota when BYOK covers the route',
    profiles: [{ id: 'profile-1' }],
    byokLeaseId: 'lease-1',
    expectedQuotaCalls: 0,
    expectedQuotaBackedRoutesAllowed: undefined,
  },
  {
    name: 'preserves explicit quota-backed route disable override',
    profiles: [],
    quotaBackedRoutesAllowed: false,
    expectedQuotaCalls: 0,
    expectedQuotaBackedRoutesAllowed: false,
  },
  {
    name: 'does not check user quota for unmetered service features',
    profiles: [],
    featureKind: 'rerank',
    expectedQuotaCalls: 0,
    expectedQuotaBackedRoutesAllowed: true,
  },
];

for (const matrixCase of turnRouteAccessCases) {
  test(`CopilotAccessPolicy resolve turn route access: ${matrixCase.name}`, async t => {
    const checkQuota = Sinon.stub().rejects(new Error('quota exceeded'));
    const getProfiles = Sinon.stub().resolves(matrixCase.profiles);
    const access = new CopilotAccessPolicy(
      { checkQuota } as any,
      { getProfiles } as any
    );

    const promise = access.resolveTurnRouteAccess({
      userId: 'user-1',
      workspaceId: 'workspace-1',
      byokLeaseId: matrixCase.byokLeaseId,
      featureKind: matrixCase.featureKind,
      quotaBackedRoutesAllowed: matrixCase.quotaBackedRoutesAllowed,
    });

    if (matrixCase.expectedError) {
      await t.throwsAsync(promise, { message: matrixCase.expectedError });
    } else {
      const routeAccess = await promise;
      t.is(
        routeAccess.quotaBackedRoutesAllowed,
        matrixCase.expectedQuotaBackedRoutesAllowed
      );
    }
    t.is(checkQuota.callCount, matrixCase.expectedQuotaCalls);
    if (matrixCase.expectedQuotaCalls) {
      Sinon.assert.calledWithExactly(checkQuota, 'user-1');
    }
    if (matrixCase.byokLeaseId) {
      Sinon.assert.calledWithMatch(getProfiles, {
        byokLeaseId: matrixCase.byokLeaseId,
      });
    }
  });
}

type ByokCoverageCase = {
  featureKind?: ByokFeatureKind;
  expected: { local: boolean; server: boolean };
};

const byokCoverageCases: ByokCoverageCase[] = [
  { featureKind: 'chat', expected: { local: true, server: true } },
  { featureKind: 'action', expected: { local: true, server: true } },
  { featureKind: 'image', expected: { local: true, server: true } },
  { featureKind: 'transcript', expected: { local: false, server: true } },
  { featureKind: 'embedding', expected: { local: false, server: true } },
  {
    featureKind: 'workspace_indexing',
    expected: { local: false, server: true },
  },
  { featureKind: 'rerank', expected: { local: false, server: true } },
  { expected: { local: true, server: true } },
];

for (const matrixCase of byokCoverageCases) {
  test(`CopilotAccessPolicy should resolve BYOK coverage for ${matrixCase.featureKind ?? 'default'}`, async t => {
    const getProfiles = Sinon.stub().resolves([]);
    const access = new CopilotAccessPolicy(
      { hasQuota: Sinon.stub().resolves(true) } as any,
      { getProfiles } as any
    );

    await access.getByokProfiles({
      userId: 'user-1',
      workspaceId: 'workspace-1',
      featureKind: matrixCase.featureKind,
    });

    t.like(getProfiles.firstCall.args[0], {
      userId: 'user-1',
      workspaceId: 'workspace-1',
    });
    t.is(getProfiles.firstCall.args[0].featureKind, matrixCase.featureKind);
    t.deepEqual(getProfiles.firstCall.args[1], matrixCase.expected);
  });
}

test('CopilotAccessPolicy assertQuotaOrByok should honor quota-backed route disable', async t => {
  const checkQuota = Sinon.stub().resolves(undefined);
  const access = new CopilotAccessPolicy(
    { checkQuota } as any,
    { getProfiles: Sinon.stub().resolves([]) } as any
  );

  await t.throwsAsync(
    access.assertQuotaOrByok({
      userId: 'user-1',
      workspaceId: 'workspace-1',
      featureKind: 'transcript',
      quotaBackedRoutesAllowed: false,
    })
  );
  Sinon.assert.notCalled(checkQuota);
});

test('ConversationHost should delegate empty no-message stream access', async t => {
  const session = stubConversationSession();
  const resolveTurnRouteAccess = Sinon.stub().rejects(
    new Error('quota exceeded')
  );
  const host = new ConversationHost(
    {
      get: Sinon.stub().resolves(session),
      revertLatestMessage: Sinon.stub().resolves(undefined),
    } as any,
    {} as any,
    {} as any,
    { resolveTurnRouteAccess } as any
  );

  await t.throwsAsync(host.prepareTurn('user-1', 'session-1', {}), {
    message: 'quota exceeded',
  });
  Sinon.assert.calledOnceWithMatch(resolveTurnRouteAccess, {
    userId: 'user-1',
    workspaceId: 'workspace-1',
  });
});

test('ConversationHost should return access decision for empty no-message stream', async t => {
  const session = stubConversationSession();
  const resolveTurnRouteAccess = Sinon.stub().resolves({
    byokProfiles: [{ id: 'profile-1' }],
    quotaBackedRoutesAllowed: undefined,
  });
  const host = new ConversationHost(
    {
      get: Sinon.stub().resolves(session),
      revertLatestMessage: Sinon.stub().resolves(undefined),
    } as any,
    {} as any,
    {} as any,
    { resolveTurnRouteAccess } as any
  );

  const prepared = await host.prepareTurn('user-1', 'session-1', {});

  t.is(prepared.latestTurn, undefined);
  t.is(prepared.quotaBackedRoutesAllowed, undefined);
  Sinon.assert.calledOnce(resolveTurnRouteAccess);
});

test('ConversationHost should replay accepted tokens without rechecking quota', async t => {
  const acceptedTurn: Turn = {
    id: 'turn-1',
    conversationId: 'session-1',
    role: 'user',
    content: 'hello',
    attachments: [],
    metadata: {},
    renderTrace: [],
    toolEvents: [],
    createdAt: new Date(),
  };
  const session = {
    ...stubConversationSession(acceptedTurn),
    findTurn: Sinon.stub().withArgs('turn-1').returns(acceptedTurn),
  };
  const resolveTurnRouteAccess = Sinon.stub().rejects(
    new Error('quota exceeded')
  );
  const host = new ConversationHost(
    {
      get: Sinon.stub().resolves(session),
      revertLatestMessage: Sinon.stub().resolves(undefined),
    } as any,
    {
      getAccepted: Sinon.stub().resolves({
        sessionId: 'session-1',
        turnId: 'turn-1',
      }),
    } as any,
    {} as any,
    { resolveTurnRouteAccess } as any
  );

  const prepared = await host.prepareTurn('user-1', 'session-1', {
    messageId: 'message-1',
  });

  t.is(prepared.latestTurn, acceptedTurn);
  t.true(prepared.quotaBackedRoutesAllowed);
  Sinon.assert.notCalled(resolveTurnRouteAccess);
});

test('ConversationHost should replay durable tokens without rechecking quota', async t => {
  const durableTurn: Turn = {
    id: 'turn-1',
    conversationId: 'session-1',
    role: 'user',
    content: 'hello',
    attachments: [],
    metadata: {},
    renderTrace: [],
    toolEvents: [],
    createdAt: new Date(),
  };
  const session = {
    ...stubConversationSession(durableTurn),
    findTurn: Sinon.stub().withArgs('turn-1').returns(durableTurn),
    pushPersistedTurn: Sinon.stub(),
  };
  const resolveTurnRouteAccess = Sinon.stub().rejects(
    new Error('quota exceeded')
  );
  const markAccepted = Sinon.stub().resolves(undefined);
  const host = new ConversationHost(
    {
      get: Sinon.stub().resolves(session),
      findTurnByCompatSubmissionId: Sinon.stub().resolves(durableTurn),
      revertLatestMessage: Sinon.stub().resolves(undefined),
    } as any,
    {
      getAccepted: Sinon.stub().resolves(undefined),
      markAccepted,
    } as any,
    {
      acquire: Sinon.stub().resolves({
        [Symbol.asyncDispose]: Sinon.stub().resolves(undefined),
      }),
    } as any,
    { resolveTurnRouteAccess } as any
  );

  const prepared = await host.prepareTurn('user-1', 'session-1', {
    messageId: 'message-1',
  });

  t.is(prepared.latestTurn, durableTurn);
  t.true(prepared.quotaBackedRoutesAllowed);
  Sinon.assert.calledOnceWithMatch(markAccepted, 'message-1', {
    sessionId: 'session-1',
    turnId: 'turn-1',
  });
  Sinon.assert.notCalled(resolveTurnRouteAccess);
});

test('ToolRuntime should pass route context into prompt-backed tools', async t => {
  const promptRuntime = {
    runText: Sinon.stub().resolves('<html><body>done</body></html>'),
  };
  const runtime = new ToolRuntime(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    promptRuntime as any,
    {} as any
  );

  const tools = await runtime.getTools(
    {
      tools: ['codeArtifact'],
      user: 'user-1',
      session: 'session-1',
      workspace: 'workspace-1',
      byokLeaseId: 'lease-1',
      featureKind: 'chat',
      quotaBackedRoutesAllowed: false,
    },
    'gpt-4o-mini'
  );

  const result = await tools.code_artifact.execute?.(
    { title: 'Demo', userPrompt: 'build a page' },
    {}
  );

  t.like(result as object, { title: 'Demo' });
  Sinon.assert.calledOnceWithMatch(
    promptRuntime.runText,
    'Code Artifact',
    { content: 'build a page' },
    {
      providerOptions: {
        user: 'user-1',
        session: 'session-1',
        workspace: 'workspace-1',
        byokLeaseId: 'lease-1',
        featureKind: 'chat',
        quotaBackedRoutesAllowed: false,
      },
    }
  );
});

test('ResponsePostprocessor should build text, object and image assistant turns', t => {
  const postprocessor = new ResponsePostprocessor();

  const textTurn = postprocessor.buildTextAssistantTurn('session-1', 'hello');
  const objectTurn = postprocessor.buildObjectAssistantTurn('session-1', [
    { type: 'text-delta', textDelta: 'hel' },
    { type: 'text-delta', textDelta: 'lo' },
  ]);
  const imageTurn = postprocessor.buildImageAssistantTurn('session-1', [
    'https://example.com/image.png',
  ]);

  t.like(textTurn, {
    conversationId: 'session-1',
    role: 'assistant',
    content: 'hello',
    attachments: [],
  });
  t.like(objectTurn, {
    conversationId: 'session-1',
    role: 'assistant',
    content: 'hello',
  });
  t.like(imageTurn, {
    conversationId: 'session-1',
    role: 'assistant',
    content: '',
    attachments: ['https://example.com/image.png'],
  });
});

test('TurnPersistence should delegate assistant turn persistence through ConversationHost', async t => {
  const persistAssistantTurn = Sinon.stub().resolves();
  const persistence = new TurnPersistence(
    { persistAssistantTurn } as any,
    new ResponsePostprocessor()
  );
  const session = {
    config: { sessionId: 'session-1' },
  } as any;

  await persistence.persistObjectResult(
    session,
    [{ type: 'text-delta', textDelta: 'done' }],
    true
  );

  t.is(persistAssistantTurn.callCount, 1);
  const [persistedSession, persistedTurn, persistedAborted] =
    persistAssistantTurn.firstCall.args;
  t.is(persistedSession, session);
  t.is(persistedAborted, true);
  t.like(persistedTurn, {
    conversationId: 'session-1',
    role: 'assistant',
    content: 'done',
  });
});

test('TurnPersistence should persist text and image assistant turns through ConversationHost', async t => {
  const persistAssistantTurn = Sinon.stub().resolves();
  const persistence = new TurnPersistence(
    { persistAssistantTurn } as any,
    new ResponsePostprocessor()
  );
  const session = {
    config: { sessionId: 'session-1' },
  } as any;

  await persistence.persistTextResult(session, 'plain text', false);
  await persistence.persistImageResult(
    session,
    ['https://example.com/generated.png'],
    false
  );

  t.is(persistAssistantTurn.callCount, 2);
  t.like(persistAssistantTurn.firstCall.args[1], {
    conversationId: 'session-1',
    role: 'assistant',
    content: 'plain text',
    attachments: [],
  });
  t.like(persistAssistantTurn.secondCall.args[1], {
    conversationId: 'session-1',
    role: 'assistant',
    content: '',
    attachments: ['https://example.com/generated.png'],
  });
});

test('ImageResultHost should persist native base64 artifact with native MIME', async t => {
  const storage = {
    put: Sinon.stub().resolves('data:image/webp;base64,aW1n'),
    handleRemoteLink: Sinon.stub(),
  };
  const host = new ImageResultHost(storage as any);

  const persisted = await host.persistNativeArtifact('user-1', 'workspace-1', {
    data_base64: 'aW1n',
    media_type: 'image/webp',
  });

  t.is(persisted, 'data:image/webp;base64,aW1n');
  Sinon.assert.calledOnceWithMatch(
    storage.put,
    'user-1',
    'workspace-1',
    Sinon.match.string,
    Buffer.from('aW1n', 'base64'),
    'image/webp'
  );
});

test('action result projection should map final result to assistant turn', t => {
  const session = {
    config: { sessionId: 'session-1' },
    stashTurns: [{ id: 'assistant-1' }],
  };

  const turn = projectActionResultToAssistantTurn({
    session: session as any,
    actionId: 'mindmap.generate',
    wasAborted: false,
    result: {
      content: 'done',
      attachments: ['https://example.com/a.png'],
      params: { mode: 'mindmap' },
    },
  });

  t.like(turn, {
    conversationId: 'session-1',
    role: 'assistant',
    content: 'done',
    attachments: ['https://example.com/a.png'],
    metadata: { mode: 'mindmap' },
  });
  t.deepEqual(turn?.renderTrace, []);
});

test('action result projection should summarize primitive text result', t => {
  const turn = projectActionResultToAssistantTurn({
    session: {
      config: { sessionId: 'session-1' },
      stashTurns: [],
    } as any,
    actionId: 'mindmap.generate',
    wasAborted: false,
    result: 'plain text',
  });

  t.like(turn, {
    conversationId: 'session-1',
    role: 'assistant',
    content: 'plain text',
    attachments: [],
  });
  t.is(summarizeActionResult('plain text'), 'plain text');
});

test('ActionRuntimeBridge should persist projected assistant message id', async t => {
  class TestActionRuntimeBridge extends ActionRuntimeBridge {
    protected override runNativeStream() {
      return (async function* () {
        yield {
          type: 'action_done' as const,
          actionId: 'mindmap.generate',
          actionVersion: 'v1',
          status: 'succeeded' as const,
          result: 'done',
        };
      })();
    }
  }
  const completedRuns: unknown[] = [];
  const persistProjectedResult = Sinon.stub().resolves('assistant-after-save');
  const actionRun = {
    create: async () => ({ id: 'run-1' }),
    markRunning: async (id: string) => ({ id, status: 'running' }),
    complete: async (id: string, input: unknown) => {
      completedRuns.push({ id, input });
      return { id, ...(input as Record<string, unknown>) };
    },
  };
  const bridge = new TestActionRuntimeBridge(
    {
      copilotActionRun: actionRun,
    } as unknown as Models,
    stubTurnPersistence(persistProjectedResult),
    undefined
  );

  for await (const event of bridge.runStream({
    userId: 'user-1',
    workspaceId: 'workspace-1',
    session: {
      config: { sessionId: 'session-1' },
      stashTurns: [],
    } as any,
    actionId: 'mindmap.generate',
    actionVersion: 'v1',
  })) {
    void event;
  }

  t.is(persistProjectedResult.callCount, 1);
  t.like((completedRuns[0] as { input: Record<string, unknown> }).input, {
    assistantMessageId: 'assistant-after-save',
  });
});

test('action result projection should map image result url to assistant attachments', t => {
  const turn = projectActionResultToAssistantTurn({
    session: {
      config: { sessionId: 'session-1' },
      stashTurns: [],
    } as any,
    actionId: 'image.filter.pixel',
    wasAborted: false,
    result: { url: 'https://example.com/final.png' },
  });

  t.deepEqual(turn?.attachments, ['https://example.com/final.png']);
});

test('CopilotEmbeddingClientService should keep dispatch client across global config refreshes', async t => {
  const taskPolicy = {
    resolveEmbeddingModelId: () => 'text-embedding-3-large',
  };
  const runtime = {
    embeddingConfigured: Sinon.stub()
      .onFirstCall()
      .resolves(true)
      .onSecondCall()
      .resolves(false),
  };
  const service = new CopilotEmbeddingClientService(
    taskPolicy as any,
    runtime as any
  );

  const first = await service.refresh();
  t.truthy(first);
  t.truthy(service.getClient());

  const second = await service.refresh();
  t.truthy(second);
  t.is(service.getClient(), second);
  Sinon.assert.calledTwice(runtime.embeddingConfigured);
  Sinon.assert.alwaysCalledWithExactly(
    runtime.embeddingConfigured,
    'text-embedding-3-large'
  );
});

test('CopilotEmbeddingClientService should keep workspace-routed embedding client without global provider', async t => {
  const taskPolicy = {
    resolveEmbeddingModelId: () => 'gemini-embedding-001',
    resolveRerankModelId: () => 'gpt-4o-mini',
  };
  const runtime = {
    embeddingConfigured: Sinon.stub().resolves(false),
  };
  const service = new CopilotEmbeddingClientService(
    taskPolicy as any,
    runtime as any
  );

  const client = await service.refresh();

  t.truthy(client);
  t.is(service.getClient(), client);
  Sinon.assert.calledOnceWithExactly(
    runtime.embeddingConfigured,
    'gemini-embedding-001'
  );
});

test('CopilotEmbeddingClientService should pass workspace context into embedding routes', async t => {
  const signal = new AbortController().signal;
  const taskPolicy = {
    resolveEmbeddingModelId: () => 'gemini-embedding-001',
    resolveRerankModelId: () => 'gpt-4o-mini',
  };
  const runtime = {
    embeddingConfigured: Sinon.stub().resolves(true),
    embed: Sinon.stub().resolves([[0.1]]),
    rerank: Sinon.stub().resolves([0.8]),
  };
  const service = new CopilotEmbeddingClientService(
    taskPolicy as any,
    runtime as any
  );
  const client = await service.refresh();

  t.truthy(client);
  await client?.getEmbeddings(['hello'], {
    workspaceId: 'workspace-1',
    userId: 'user-1',
    featureKind: 'workspace_indexing',
    signal,
  });

  Sinon.assert.calledOnceWithMatch(
    runtime.embed,
    'gemini-embedding-001',
    ['hello'],
    {
      dimensions: Sinon.match.number,
      workspace: 'workspace-1',
      user: 'user-1',
      featureKind: 'workspace_indexing',
      signal,
    }
  );

  await client?.reRank(
    'hello',
    [{ chunk: 0, content: 'hello', distance: 0.2 }],
    1,
    {
      workspaceId: 'workspace-1',
      userId: 'user-1',
      featureKind: 'workspace_indexing',
      signal,
    }
  );

  Sinon.assert.calledOnceWithMatch(
    runtime.rerank,
    'gpt-4o-mini',
    {
      query: 'hello',
      candidates: [{ id: '0', text: 'hello' }],
    },
    {
      workspace: 'workspace-1',
      user: 'user-1',
      featureKind: 'rerank',
      signal,
    }
  );
});

test('CompatHistoryProjector should compose visibility, prompt preload and attachment url projection', t => {
  const projector = new CompatHistoryProjector(
    new HistoryVisibilityPolicy(),
    new HistoryPromptPreloadProjector({
      finish: () => [
        {
          role: 'assistant',
          content: 'preload',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    } as any),
    new HistoryAttachmentUrlProjector()
  );
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const updatedAt = new Date('2026-01-01T00:10:00.000Z');

  const visible = projector.projectHistory(
    {
      conversation: {
        id: 'session-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        docId: null,
        parentId: null,
        pinned: false,
        title: 'History',
        createdAt,
        updatedAt,
      } as any,
      turns: [
        {
          conversationId: 'session-1',
          role: 'user',
          content: 'show the file',
          attachments: [{ kind: 'url', url: 'https://example.com/file.pdf' }],
          renderTrace: [],
          toolEvents: [],
          metadata: {},
          createdAt: updatedAt,
        },
      ],
      prompt: {
        name: 'builtin',
        action: 'summary',
        model: 'gpt-5-mini',
        optionalModels: [],
        params: {},
        source: 'built_in',
      } as any,
      tokenCost: 42,
    },
    {
      requestUserId: 'user-1',
      action: true,
      withMessages: true,
      withPrompt: true,
    }
  );

  t.truthy(visible);
  t.is(visible?.messages.length, 2);
  t.is(visible?.messages[0]?.content, 'preload');
  t.deepEqual(visible?.messages[1]?.attachments, [
    'https://example.com/file.pdf',
  ]);

  const hidden = projector.projectHistory(
    {
      conversation: {
        id: 'session-2',
        userId: 'another-user',
        workspaceId: 'workspace-1',
        docId: null,
        parentId: null,
        pinned: false,
        title: 'Hidden',
        createdAt,
        updatedAt,
      } as any,
      turns: [],
      prompt: {
        name: 'builtin',
        action: 'summary',
        model: 'gpt-5-mini',
        optionalModels: [],
        params: {},
        source: 'built_in',
      } as any,
      tokenCost: 0,
    },
    {
      requestUserId: 'user-1',
      action: false,
      withMessages: true,
    }
  );

  t.is(hidden, undefined);
});

test('AttachmentAdmissionHost should reject remote attachments through host fetch admission', async t => {
  const materializer = {
    fetchRemoteAttachment: Sinon.stub().rejects(new Error('SSRF blocked')),
  };
  const host = new AttachmentAdmissionHost(
    materializer as unknown as AttachmentMaterializer
  );

  await t.throwsAsync(
    host.admitPromptAttachment('http://127.0.0.1/internal.png', {
      userId: 'user-1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    }),
    { message: /SSRF blocked/ }
  );
  Sinon.assert.calledOnceWithExactly(
    materializer.fetchRemoteAttachment,
    'http://127.0.0.1/internal.png',
    Sinon.match({
      maxBytes: 64 * 1024 * 1024,
    })
  );
});

test('AttachmentAdmissionHost should prefer trusted host MIME over data URL prefix', async t => {
  const host = new AttachmentAdmissionHost({
    fetchRemoteAttachment: Sinon.stub(),
  } as unknown as AttachmentMaterializer);
  const data = Buffer.from('audio-bytes', 'utf8').toString('base64');

  const admitted = await host.admitPromptAttachment(
    {
      attachment: `data:image/png;base64,${data}`,
      mimeType: 'audio/webm',
    },
    {
      userId: 'user-1',
      workspaceId: 'workspace-1',
      sessionId: 'session-1',
    }
  );

  t.like(admitted, {
    kind: 'bytes',
    mimeType: 'audio/webm',
    size: Buffer.byteLength('audio-bytes'),
  });
});

test('AttachmentAdmissionHost should keep declared Gemini audio MIME after remote prefetch', async t => {
  const materializer = {
    fetchRemoteAttachment: Sinon.stub().resolves({
      data: Buffer.from('audio-bytes', 'utf8').toString('base64'),
      mimeType: 'image/png',
    }),
  };
  const host = new AttachmentAdmissionHost(
    materializer as unknown as AttachmentMaterializer
  );

  const admitted = await host.admitPromptAttachment(
    {
      kind: 'url',
      url: 'https://example.com/recording',
      mimeType: 'audio/mpeg',
      providerHint: { provider: CopilotProviderType.Gemini, kind: 'audio' },
    },
    {
      userId: 'user-1',
      workspaceId: 'workspace-1',
    }
  );
  const promptAttachment = admittedAttachmentToPromptAttachment(admitted);

  t.is(admitted.mimeType, 'audio/mpeg');
  t.deepEqual(promptAttachment, {
    kind: 'bytes',
    data: Buffer.from('audio-bytes', 'utf8').toString('base64'),
    encoding: 'base64',
    mimeType: 'audio/mpeg',
    fileName: undefined,
    providerHint: { provider: 'gemini', kind: 'audio' },
  });
});

test('AttachmentMaterializer should resolve gs attachments through storage HTTPS fetch URL', t => {
  t.is(
    resolveAttachmentFetchUrl('gs://bucket/audio.opus').toString(),
    'https://storage.googleapis.com/bucket/audio.opus'
  );
  t.is(
    resolveAttachmentFetchUrl(
      'gs://bucket/folder/audio.opus?alt=media'
    ).toString(),
    'https://storage.googleapis.com/bucket/folder/audio.opus?alt=media'
  );
});

test('ActionRuntimeBridge should persist action run status around native stream', async t => {
  class TestActionRuntimeBridge extends ActionRuntimeBridge {
    protected override runNativeStream() {
      return (async function* () {
        yield {
          type: 'action_start' as const,
          actionId: 'mindmap.generate',
          actionVersion: 'v1',
          status: 'running' as const,
        };
        yield {
          type: 'action_done' as const,
          actionId: 'mindmap.generate',
          actionVersion: 'v1',
          status: 'succeeded' as const,
          result: { nodes: [{ text: 'Root' }] },
        };
      })();
    }
  }
  const createdRuns: unknown[] = [];
  const completedRuns: unknown[] = [];
  const actionRun = {
    create: async (input: unknown) => {
      createdRuns.push(input);
      return { id: 'run-1' };
    },
    markRunning: async (id: string) => ({ id, status: 'running' }),
    complete: async (id: string, input: unknown) => {
      completedRuns.push({ id, input });
      return { id, ...(input as Record<string, unknown>) };
    },
  };
  const bridge = new TestActionRuntimeBridge(
    {
      copilotActionRun: actionRun,
    } as unknown as Models,
    stubTurnPersistence(),
    undefined
  );

  const events = [];
  for await (const event of bridge.runStream({
    userId: 'user-1',
    workspaceId: 'workspace-1',
    session: undefined,
    actionId: 'mindmap.generate',
    actionVersion: 'v1',
    inputSnapshot: { prompt: 'make map' },
    nativeInput: {
      input: {
        mockOutput: {
          generate: {
            nodes: [{ text: 'Root' }],
          },
        },
      },
    },
  })) {
    events.push(event);
  }

  t.is(events[0]?.runId, 'run-1');
  t.is(events.at(-1)?.type, 'action_done');
  t.like(createdRuns[0], {
    userId: 'user-1',
    workspaceId: 'workspace-1',
    actionId: 'mindmap.generate',
    actionVersion: 'v1',
    inputSnapshot: { prompt: 'make map' },
  });
  t.like(completedRuns[0] as { id: string; input: Record<string, unknown> }, {
    id: 'run-1',
    input: {
      status: 'succeeded',
      result: { nodes: [{ text: 'Root' }] },
      artifacts: [],
      resultSummary: '{"nodes":[{"text":"Root"}]}',
      errorCode: null,
      trace: undefined,
      assistantMessageId: null,
    },
  });
});

test('ActionRuntimeBridge should derive retry attempt from previous action run', async t => {
  const createdRuns: unknown[] = [];
  class TestActionRuntimeBridge extends ActionRuntimeBridge {
    protected override runNativeStream() {
      return (async function* () {
        yield {
          type: 'action_done' as const,
          actionId: 'mindmap.generate',
          actionVersion: 'v1',
          status: 'succeeded' as const,
          result: { content: 'retry attempt derived' },
        };
      })();
    }
  }
  const actionRun = {
    get: async (id: string) => ({
      id,
      userId: 'user-1',
      workspaceId: 'workspace-1',
      sessionId: null,
      actionId: 'mindmap.generate',
      actionVersion: 'v1',
      attempt: 2,
    }),
    create: async (input: unknown) => {
      createdRuns.push(input);
      return { id: 'run-3' };
    },
    markRunning: async (id: string) => ({ id, status: 'running' }),
    complete: async (id: string, input: unknown) => ({ id, input }),
  };
  const bridge = new TestActionRuntimeBridge(
    { copilotActionRun: actionRun } as unknown as Models,
    stubTurnPersistence(),
    undefined
  );

  for await (const event of bridge.runStream({
    userId: 'user-1',
    workspaceId: 'workspace-1',
    actionId: 'mindmap.generate',
    actionVersion: 'v1',
    retryOf: 'run-2',
  })) {
    void event;
  }

  t.like(createdRuns[0] as Record<string, unknown>, {
    attempt: 3,
    retryOf: 'run-2',
  });
});

test('ActionRuntimeBridge should reject retry source from different action owner', async t => {
  class TestActionRuntimeBridge extends ActionRuntimeBridge {
    protected override runNativeStream(): never {
      throw new Error('owner mismatch should reject before native stream');
    }
  }
  const actionRun = {
    get: async (id: string) => ({
      id,
      userId: 'other-user',
      workspaceId: 'workspace-1',
      sessionId: null,
      actionId: 'mindmap.generate',
      actionVersion: 'v1',
      attempt: 1,
    }),
    create: async () => {
      throw new Error('create should not be called');
    },
  };
  const bridge = new TestActionRuntimeBridge(
    { copilotActionRun: actionRun } as unknown as Models,
    stubTurnPersistence(),
    undefined
  );

  await t.throwsAsync(
    async () => {
      for await (const event of bridge.runStream({
        userId: 'user-1',
        workspaceId: 'workspace-1',
        actionId: 'mindmap.generate',
        actionVersion: 'v1',
        retryOf: 'run-1',
      })) {
        void event;
      }
    },
    { message: /does not match current action/ }
  );
});

test('ActionRuntimeBridge should validate retry source before accepting explicit attempt', async t => {
  class TestActionRuntimeBridge extends ActionRuntimeBridge {
    protected override runNativeStream(): never {
      throw new Error('explicit retry attempt should reject before stream');
    }
  }
  const actionRun = {
    get: async (id: string) => ({
      id,
      userId: 'other-user',
      workspaceId: 'workspace-1',
      sessionId: null,
      actionId: 'mindmap.generate',
      actionVersion: 'v1',
      attempt: 1,
    }),
    create: async () => {
      throw new Error('create should not be called');
    },
  };
  const bridge = new TestActionRuntimeBridge(
    { copilotActionRun: actionRun } as unknown as Models,
    stubTurnPersistence(),
    undefined
  );

  await t.throwsAsync(
    async () => {
      for await (const event of bridge.runStream({
        userId: 'user-1',
        workspaceId: 'workspace-1',
        actionId: 'mindmap.generate',
        actionVersion: 'v1',
        retryOf: 'run-1',
        attempt: 3,
      })) {
        void event;
      }
    },
    { message: /does not match current action/ }
  );
});

test('ActionRuntimeBridge should reject retry source bound to another session', async t => {
  class TestActionRuntimeBridge extends ActionRuntimeBridge {
    protected override runNativeStream(): never {
      throw new Error('session mismatch should reject before native stream');
    }
  }
  const actionRun = {
    get: async (id: string) => ({
      id,
      userId: 'user-1',
      workspaceId: 'workspace-1',
      sessionId: 'previous-session',
      actionId: 'mindmap.generate',
      actionVersion: 'v1',
      attempt: 1,
    }),
    create: async () => {
      throw new Error('create should not be called');
    },
  };
  const bridge = new TestActionRuntimeBridge(
    { copilotActionRun: actionRun } as unknown as Models,
    stubTurnPersistence(),
    undefined
  );

  await t.throwsAsync(
    async () => {
      for await (const event of bridge.runStream({
        userId: 'user-1',
        workspaceId: 'workspace-1',
        actionId: 'mindmap.generate',
        actionVersion: 'v1',
        retryOf: 'run-1',
      })) {
        void event;
      }
    },
    { message: /does not match current action/ }
  );
});

test('ActionRuntimeBridge should persist attachments and lightweight trace', async t => {
  const completedRuns: unknown[] = [];
  class TestActionRuntimeBridge extends ActionRuntimeBridge {
    protected override runNativeStream() {
      return (async function* () {
        yield {
          type: 'attachment' as const,
          actionId: 'image.filter.pixel',
          actionVersion: 'v1',
          attachment: { url: 'https://example.com/pixel.png' },
        };
        yield {
          type: 'action_done' as const,
          actionId: 'image.filter.pixel',
          actionVersion: 'v1',
          status: 'succeeded' as const,
          result: {
            content: 'done',
            artifacts: [{ url: 'https://example.com/final.png' }],
          },
        };
      })();
    }
  }
  const actionRun = {
    create: async () => ({ id: 'run-1' }),
    markRunning: async (id: string) => ({ id, status: 'running' }),
    complete: async (id: string, input: unknown) => {
      completedRuns.push({ id, input });
      return { id, ...(input as Record<string, unknown>) };
    },
  };
  const bridge = new TestActionRuntimeBridge(
    { copilotActionRun: actionRun } as unknown as Models,
    stubTurnPersistence(),
    undefined
  );

  for await (const event of bridge.runStream({
    userId: 'user-1',
    workspaceId: 'workspace-1',
    actionId: 'image.filter.pixel',
    actionVersion: 'v1',
  })) {
    void event;
  }

  t.like((completedRuns[0] as { input: Record<string, unknown> }).input, {
    status: 'succeeded',
  });
  t.deepEqual(
    (completedRuns[0] as { input: { artifacts: unknown } }).input.artifacts,
    [
      { url: 'https://example.com/pixel.png' },
      { url: 'https://example.com/final.png' },
    ]
  );
  t.is(
    (completedRuns[0] as { input: { trace: unknown } }).input.trace,
    undefined
  );
});

test('ActionRuntimeBridge should inject prepared structured routes into native input', async t => {
  const capturedInputs: unknown[] = [];
  class TestActionRuntimeBridge extends ActionRuntimeBridge {
    protected override runNativeStream(input: unknown) {
      capturedInputs.push(input);
      return (async function* () {
        yield {
          type: 'action_done' as const,
          actionId: 'mindmap.generate',
          actionVersion: 'v1',
          status: 'succeeded' as const,
          result: { content: 'ok' },
        };
      })();
    }
  }
  const actionRun = {
    create: async () => ({ id: 'run-1' }),
    markRunning: async (id: string) => ({ id, status: 'running' }),
    complete: async (id: string, input: unknown) => ({ id, input }),
  };
  const plans = {
    buildStructuredPlan: async (model: { modelId?: string }) => {
      t.deepEqual(model, { modelId: 'model-1' });
      return {
        nativeDispatch: {
          structured: {
            routes: [{ provider: 'openai', modelId: 'model-1' }],
          },
        },
      };
    },
  };
  const bridge = new TestActionRuntimeBridge(
    { copilotActionRun: actionRun } as unknown as Models,
    stubTurnPersistence(),
    plans as any
  );

  for await (const event of bridge.runStream({
    userId: 'user-1',
    workspaceId: 'workspace-1',
    actionId: 'mindmap.generate',
    actionVersion: 'v1',
    prepareStructuredRoutes: {
      stepId: 'generate',
      modelId: 'model-1',
      messages: [{ role: 'user', content: 'make a map' }],
    },
  })) {
    void event;
  }

  const nativeInput = capturedInputs[0] as {
    input: { preparedRoutes: Record<string, unknown> };
  };
  t.deepEqual(nativeInput.input.preparedRoutes.generate, [
    { provider: 'openai', modelId: 'model-1' },
  ]);
});

test('ActionRuntimeBridge should inject prepared image routes and persist attachment events', async t => {
  const capturedInputs: unknown[] = [];
  const completedRuns: unknown[] = [];
  class TestActionRuntimeBridge extends ActionRuntimeBridge {
    protected override runNativeStream(input: unknown) {
      capturedInputs.push(input);
      return (async function* () {
        yield {
          type: 'attachment' as const,
          actionId: 'image.filter.sketch',
          actionVersion: 'v1',
          attachment: { url: 'data:image/png;base64,aW1hZ2U=' },
        };
        yield {
          type: 'action_done' as const,
          actionId: 'image.filter.sketch',
          actionVersion: 'v1',
          status: 'succeeded' as const,
          result: { url: 'data:image/png;base64,aW1hZ2U=' },
        };
      })();
    }
  }
  const actionRun = {
    create: async () => ({ id: 'run-1' }),
    markRunning: async (id: string) => ({ id, status: 'running' }),
    complete: async (id: string, input: unknown) => {
      completedRuns.push({ id, input });
      return { id, input };
    },
  };
  const plans = {
    buildImagePlan: async (model: { modelId?: string }) => {
      t.deepEqual(model, { modelId: 'gpt-image-1' });
      return {
        nativeDispatch: {
          image: {
            routes: [{ provider: 'openai', modelId: 'gpt-image-1' }],
          },
        },
      };
    },
  };
  const bridge = new TestActionRuntimeBridge(
    { copilotActionRun: actionRun } as unknown as Models,
    stubTurnPersistence(),
    plans as any
  );
  const events = [];

  for await (const event of bridge.runStream({
    userId: 'user-1',
    workspaceId: 'workspace-1',
    actionId: 'image.filter.sketch',
    actionVersion: 'v1',
    prepareImageRoutes: {
      stepId: 'generate-image',
      modelId: 'gpt-image-1',
      messages: [{ role: 'user', content: 'draw' }],
    },
    persistAttachment: async attachment => ({
      ...(attachment as Record<string, unknown>),
      url: 'affine://image-result',
    }),
  })) {
    events.push(event);
  }

  const nativeInput = capturedInputs[0] as {
    input: { preparedRoutes: Record<string, unknown> };
  };
  t.deepEqual(nativeInput.input.preparedRoutes['generate-image'], [
    { provider: 'openai', modelId: 'gpt-image-1' },
  ]);
  t.deepEqual(events[0].attachment, { url: 'affine://image-result' });
  t.like((completedRuns[0] as { input: Record<string, unknown> }).input, {
    artifacts: [{ url: 'affine://image-result' }],
  });
});

test('ActionRuntimeBridge should persist aborted status from abort signal', async t => {
  class TestActionRuntimeBridge extends ActionRuntimeBridge {
    protected override runNativeStream() {
      return (async function* () {
        yield {
          type: 'action_start' as const,
          actionId: 'mindmap.generate',
          actionVersion: 'v1',
          status: 'running' as const,
        };
      })();
    }
  }
  const completedRuns: unknown[] = [];
  const actionRun = {
    create: async () => ({ id: 'run-1' }),
    markRunning: async (id: string) => ({ id, status: 'running' }),
    complete: async (id: string, input: unknown) => {
      completedRuns.push({ id, input });
      return { id, ...(input as Record<string, unknown>) };
    },
  };
  const abort = new AbortController();
  abort.abort();
  const bridge = new TestActionRuntimeBridge(
    { copilotActionRun: actionRun } as unknown as Models,
    stubTurnPersistence(),
    undefined
  );

  for await (const event of bridge.runStream({
    userId: 'user-1',
    workspaceId: 'workspace-1',
    actionId: 'mindmap.generate',
    actionVersion: 'v1',
    signal: abort.signal,
  })) {
    void event;
  }

  t.like((completedRuns[0] as { input: Record<string, unknown> }).input, {
    status: 'aborted',
    errorCode: undefined,
  });
});

test('ActionStreamHost should project native action events into ChatEvent envelope', t => {
  t.deepEqual(
    projectActionEventToChatEvent('message-1', {
      type: 'attachment',
      actionId: 'mindmap.generate',
      actionVersion: 'v1',
      runId: 'run-1',
      attachment: { url: 'https://example.com/a.png' },
    }),
    {
      type: 'attachment',
      id: 'message-1',
      data: { url: 'https://example.com/a.png' },
    }
  );
  t.deepEqual(
    projectActionEventToChatEvent('message-1', {
      type: 'action_done',
      actionId: 'mindmap.generate',
      actionVersion: 'v1',
      runId: 'run-1',
      status: 'succeeded',
    }),
    {
      type: 'event',
      id: 'message-1',
      data: {
        type: 'action_done',
        actionId: 'mindmap.generate',
        actionVersion: 'v1',
        runId: 'run-1',
        status: 'succeeded',
      },
    }
  );
});

test('ActionStreamHost should prepare action turn and bridge native stream', async t => {
  const bridgeInputs: unknown[] = [];
  const session = {
    config: {
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
      docId: 'doc-1',
      promptName: 'mindmap.generate',
      promptConfig: {},
    },
    finish: Sinon.stub().returns([{ role: 'user', content: 'make a map' }]),
  };
  const conversations = {
    prepareTurn: Sinon.stub().resolves({
      messageId: 'submission-1',
      params: { topic: 'planning' },
      session,
      latestTurn: { id: 'turn-1' },
    }),
    buildLatestTurnPromptParams: Sinon.stub().returns({
      content: 'make a map',
    }),
  };
  const prompts = {
    get: Sinon.stub().resolves({
      model: 'prompt-model',
      config: {},
    }),
    finish: Sinon.stub().returns([{ role: 'user', content: 'make a map' }]),
  };
  const bridge = {
    runStream: (input: unknown) => {
      bridgeInputs.push(input);
      return (async function* () {
        yield {
          type: 'action_done' as const,
          actionId: 'mindmap.generate',
          actionVersion: 'v1',
          status: 'succeeded' as const,
          runId: 'run-1',
          result: { content: 'ok' },
        };
      })();
    },
  };
  const host = new ActionStreamHost(
    conversations as any,
    bridge as unknown as ActionRuntimeBridge,
    prompts as any,
    {} as any
  );

  const prepared = await host.stream('user-1', 'session-1', {
    actionId: 'mindmap.generate',
    actionVersion: 'v1',
    modelId: 'model-1',
    retry: 'true',
    runId: 'run-1',
    messageId: 'submission-1',
  });
  const events = [];
  for await (const event of prepared.stream) {
    events.push(event);
  }

  t.is(prepared.messageId, 'submission-1');
  t.is(prepared.actionId, 'mindmap.generate');
  t.is(prepared.actionVersion, 'v1');
  t.is(events.at(-1)?.type, 'action_done');
  Sinon.assert.calledOnceWithExactly(
    conversations.prepareTurn,
    'user-1',
    'session-1',
    {
      actionId: 'mindmap.generate',
      actionVersion: 'v1',
      modelId: 'model-1',
      retry: 'true',
      runId: 'run-1',
      messageId: 'submission-1',
    }
  );
  t.like(bridgeInputs[0] as Record<string, unknown>, {
    userId: 'user-1',
    workspaceId: 'workspace-1',
    docId: 'doc-1',
    userMessageId: 'turn-1',
    compatSubmissionId: 'submission-1',
    actionId: 'mindmap.generate',
    actionVersion: 'v1',
    retryOf: 'run-1',
  });
  t.like(
    (bridgeInputs[0] as { prepareStructuredRoutes: Record<string, unknown> })
      .prepareStructuredRoutes,
    {
      stepId: 'generate',
      modelId: 'model-1',
      messages: [{ role: 'user', content: 'make a map' }],
      responseSchemaJson: {
        type: 'object',
        properties: {
          result: { type: 'string' },
        },
        required: ['result'],
        additionalProperties: false,
      },
    }
  );
  Sinon.assert.calledOnceWithExactly(prompts.get, 'mindmap.generate');
});

test('ActionStreamHost should prepare image action routes and persist native attachments', async t => {
  const bridgeInputs: any[] = [];
  const imageResults = {
    persistNativeArtifact: Sinon.stub().resolves('affine://image-result'),
  };
  const session = {
    config: {
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
      docId: 'doc-1',
      promptName: 'image.filter.sketch',
      promptConfig: {},
    },
    finish: Sinon.stub().returns([{ role: 'user', content: 'fallback' }]),
  };
  const conversations = {
    prepareTurn: Sinon.stub().resolves({
      messageId: 'submission-1',
      params: { content: 'make a sketch' },
      session,
      latestTurn: { id: 'turn-1' },
    }),
    buildLatestTurnPromptParams: Sinon.stub().returns({}),
  };
  const prompts = {
    get: Sinon.stub().resolves({
      model: 'gpt-image-1',
      config: { quality: 'high' },
    }),
    finish: Sinon.stub().returns([{ role: 'user', content: 'make a sketch' }]),
  };
  const bridge = {
    runStream: (input: any) => {
      bridgeInputs.push(input);
      return (async function* () {
        const attachment = await input.persistAttachment({
          data_base64: 'aW1hZ2U=',
          media_type: 'image/png',
        });
        yield {
          type: 'attachment' as const,
          actionId: 'image.filter.sketch',
          actionVersion: 'v1',
          runId: 'run-1',
          attachment,
        };
      })();
    },
  };
  const host = new ActionStreamHost(
    conversations as any,
    bridge as unknown as ActionRuntimeBridge,
    prompts as any,
    imageResults as any
  );

  const prepared = await host.stream('user-1', 'session-1', {
    actionId: 'image.filter.sketch',
    modelId: 'chat-model',
  });
  const events = [];
  for await (const event of prepared.stream) {
    events.push(event);
  }

  t.is(bridgeInputs[0].prepareStructuredRoutes, undefined);
  t.like(bridgeInputs[0].prepareImageRoutes, {
    stepId: 'generate-image',
    modelId: 'gpt-image-1',
    messages: [{ role: 'user', content: 'make a sketch' }],
  });
  t.like(bridgeInputs[0].prepareImageRoutes.options, {
    quality: 'high',
    user: 'user-1',
    workspace: 'workspace-1',
    session: 'session-1',
  });
  t.deepEqual(events[0].attachment, {
    url: 'affine://image-result',
    mimeType: 'image/png',
  });
  Sinon.assert.calledOnceWithExactly(
    imageResults.persistNativeArtifact,
    'user-1',
    'workspace-1',
    {
      data_base64: 'aW1hZ2U=',
      media_type: 'image/png',
    }
  );
});

test('attachment materialization planner should keep admitted bytes inline', async t => {
  const host = new AttachmentAdmissionHost({
    fetchRemoteAttachment: Sinon.stub(),
  } as unknown as AttachmentMaterializer);
  const admitted = await host.admitPromptAttachment(
    {
      kind: 'bytes',
      data: Buffer.from('image-bytes', 'utf8').toString('base64'),
      mimeType: 'image/png',
    },
    {
      userId: 'user-1',
      workspaceId: 'workspace-1',
    }
  );
  t.deepEqual(planAdmittedAttachmentMaterialization(admitted), {
    mode: 'inline',
    reason: 'admitted_bytes',
    attachment: {
      kind: 'bytes',
      data: Buffer.from('image-bytes', 'utf8').toString('base64'),
      encoding: 'base64',
      mimeType: 'image/png',
      fileName: undefined,
      providerHint: undefined,
    },
  });
});

test('attachment materialization planner should separate Gemini remote reference and inline prefetch', async t => {
  const backendConfig = {
    base_url: 'https://generativelanguage.googleapis.com/v1beta',
    auth_token: 'test-key',
    request_layer: 'gemini_api' as const,
  };

  const inlinePlan = await planHostUrlAttachmentMaterialization(
    'gemini',
    backendConfig,
    {
      attachmentId: 'att-inline',
      url: 'https://example.com/a.mp3',
      expectedMime: 'audio/mpeg',
      maxSize: 64 * 1024 * 1024,
    }
  );
  const remotePlan = await planHostUrlAttachmentMaterialization(
    'gemini',
    backendConfig,
    {
      attachmentId: 'att-file',
      url: 'https://generativelanguage.googleapis.com/v1beta/files/file-123',
      expectedMime: 'application/pdf',
      maxSize: 64 * 1024 * 1024,
    }
  );

  t.like(inlinePlan, {
    mode: 'materialization_request',
    reason: 'gemini_api_inline_http_url',
  });
  t.like(
    inlinePlan.mode === 'materialization_request'
      ? inlinePlan.request
      : undefined,
    {
      attachmentId: 'att-inline',
      target: 'bytes',
      expectedMime: 'audio/mpeg',
      redirectPolicy: 'follow-safe',
    }
  );
  t.like(remotePlan, {
    mode: 'remote_reference',
    reason: 'gemini_api_file_uri',
    url: 'https://generativelanguage.googleapis.com/v1beta/files/file-123',
  });
});
