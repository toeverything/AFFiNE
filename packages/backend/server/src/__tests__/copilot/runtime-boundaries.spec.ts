import { EventEmitter } from 'node:events';

import ava from 'ava';
import { firstValueFrom } from 'rxjs';

import type { Config, JobQueue } from '../../base';
import { ServerFeature, type ServerService } from '../../core';
import type { Models } from '../../models';
import { HistoryPromptPreloadProjector } from '../../plugins/copilot/compat/history-prompt-preload-projector';
import { CopilotController } from '../../plugins/copilot/controller';
import { ConversationPolicy } from '../../plugins/copilot/conversation/policy';
import {
  chatMessageFromTurn,
  type Turn,
  turnFromChatMessage,
} from '../../plugins/copilot/core';
import { CopilotCronJobs } from '../../plugins/copilot/cron';
import {
  CopilotFeatureGuard,
  CopilotFeatureService,
} from '../../plugins/copilot/feature';
import type { PromptService } from '../../plugins/copilot/prompt';
import type { ResolvedPrompt } from '../../plugins/copilot/prompt/spec';
import { TextStreamParser } from '../../plugins/copilot/providers/utils';
import {
  projectActionEventToChatEvent,
  projectActionResultToAssistantTurn,
} from '../../plugins/copilot/runtime/action-output-projector';
import type { ActionStreamHost } from '../../plugins/copilot/runtime/hosts/action-stream-host';
import type { TurnOrchestrator } from '../../plugins/copilot/runtime/turn-orchestrator';
import { ChatSession } from '../../plugins/copilot/session';
import type { CopilotStorage } from '../../plugins/copilot/storage';

const test = ava;

test('copilot config controls the server feature and request admission', t => {
  const config = { copilot: { enabled: false } } as Config;
  const features = new Set<ServerFeature>();
  const server = {
    enableFeature: (feature: ServerFeature) => features.add(feature),
    disableFeature: (feature: ServerFeature) => features.delete(feature),
  } as unknown as ServerService;
  const feature = new CopilotFeatureService(config, server);
  const guard = new CopilotFeatureGuard(feature);

  feature.onConfigInit();
  t.false(features.has(ServerFeature.Copilot));
  t.throws(() => guard.canActivate(), { message: 'Copilot is disabled.' });

  config.copilot.enabled = true;
  feature.onConfigChanged({ updates: { copilot: { enabled: true } } });
  t.true(features.has(ServerFeature.Copilot));
  t.true(guard.canActivate());

  config.copilot.enabled = false;
  feature.onConfigChanged({ updates: { copilot: { enabled: false } } });
  t.false(features.has(ServerFeature.Copilot));
});

const prompt: ResolvedPrompt = {
  name: 'Chat With AFFiNE AI',
  config: {},
  paramKeys: [],
  params: {},
};

function turn(
  conversationId: string,
  role: Turn['role'],
  content: string,
  extra: Partial<Turn> = {}
): Turn {
  return {
    conversationId,
    role,
    content,
    attachments: [],
    renderTrace: [],
    toolEvents: [],
    metadata: {},
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...extra,
  };
}

test('chat session preserves prompt params, attachments, stash and revert semantics', async t => {
  const saved: Turn[][] = [];
  const session = new ChatSession(
    {
      sessionId: 'session-1',
      userId: 'user-1',
      workspaceId: 'workspace-1',
      docId: 'doc-1',
      prompt,
      turns: [turn('session-1', 'user', 'persisted')],
    },
    (_prompt, turns, params) => [
      { role: 'system', content: `hello ${params.word}` },
      ...turns,
    ],
    async state => {
      saved.push(state.turns);
    }
  );

  session.pushTurn(
    turn('session-1', 'assistant', 'answer', {
      attachments: [
        {
          kind: 'file_handle',
          fileHandle: 'file-1',
          mimeType: 'application/pdf',
        },
      ],
      metadata: { word: 'world' },
    })
  );
  t.is(session.stashTurns.length, 1);
  t.deepEqual(session.finish({ word: 'direct' }), [
    { role: 'system', content: 'hello direct' },
    {
      role: 'user',
      content: 'persisted',
      attachments: undefined,
      params: undefined,
    },
    {
      role: 'assistant',
      content: 'answer',
      attachments: [
        {
          kind: 'file_handle',
          fileHandle: 'file-1',
          mimeType: 'application/pdf',
        },
      ],
      params: { word: 'world' },
    },
  ]);

  await session.save();
  t.is(session.stashTurns.length, 0);
  t.deepEqual(
    saved[0].map(item => item.content),
    ['answer']
  );

  session.pushTurn(turn('session-1', 'user', 'retry'));
  session.pushTurn(turn('session-1', 'assistant', 'retry answer'));
  session.revertLatestMessage(false);
  t.deepEqual(
    session.finish({ word: 'direct' }).map(item => item.content),
    ['hello direct', 'persisted', 'answer', 'retry']
  );
  session.revertLatestMessage(true);
  t.deepEqual(
    session.finish({ word: 'direct' }).map(item => item.content),
    ['hello direct', 'persisted', 'answer']
  );
});

test('chat message adapters preserve and canonicalize assistant render trace', t => {
  const message = {
    id: 'message-1',
    role: 'assistant' as const,
    content: 'Final answer',
    params: { schemaVersion: 'v1' },
    streamObjects: [
      { type: 'reasoning' as const, textDelta: 'Plan ' },
      { type: 'reasoning' as const, textDelta: 'first' },
      {
        type: 'tool-call' as const,
        toolCallId: 'call-1',
        toolName: 'doc_read',
        args: { docId: 'doc-1' },
      },
      {
        type: 'tool-result' as const,
        toolCallId: 'call-1',
        toolName: 'doc_read',
        args: { docId: 'doc-1' },
        result: { markdown: '# AFFiNE' },
      },
      { type: 'text-delta' as const, textDelta: 'Final answer' },
    ],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  const converted = turnFromChatMessage(message, 'session-1');
  t.deepEqual(converted.renderTrace, [
    { type: 'reasoning', textDelta: 'Plan first' },
    {
      type: 'tool-result',
      toolCallId: 'call-1',
      toolName: 'doc_read',
      args: { docId: 'doc-1' },
      result: { markdown: '# AFFiNE' },
    },
    { type: 'text-delta', textDelta: 'Final answer' },
  ]);
  t.deepEqual(
    converted.toolEvents.map(event => event.type),
    ['tool_result']
  );
  t.deepEqual(chatMessageFromTurn(converted), {
    ...message,
    attachments: undefined,
    streamObjects: converted.renderTrace,
  });
});

test('action output projection preserves public SSE and assistant-turn contracts', t => {
  const session = new ChatSession(
    {
      sessionId: 'session-1',
      userId: 'user-1',
      workspaceId: 'workspace-1',
      docId: 'doc-1',
      prompt,
      turns: [],
    },
    () => []
  );

  t.deepEqual(
    projectActionEventToChatEvent('message-1', {
      type: 'action_done',
      actionId: 'slides.outline',
      actionVersion: 'v1',
      status: 'succeeded',
      runId: 'run-1',
      result: { content: '- Launch deck' },
    }),
    { type: 'message', id: 'message-1', data: '- Launch deck' }
  );
  t.like(
    projectActionResultToAssistantTurn({
      session,
      actionId: 'image.filter.remove-background',
      result: {},
      artifacts: [{ url: 'https://example.com/result.png' }],
      wasAborted: false,
    }),
    {
      conversationId: 'session-1',
      role: 'assistant',
      attachments: ['https://example.com/result.png'],
    }
  );
  t.is(
    projectActionResultToAssistantTurn({
      session,
      actionId: 'transcript.audio',
      result: {},
      wasAborted: false,
    }),
    null
  );
});

test('text stream parser keeps reasoning and tool output distinct from answer text', t => {
  const parser = new TextStreamParser();
  const output = [
    parser.parse({ type: 'reasoning-delta', text: 'Think' }),
    parser.parse({
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'web_search_exa',
      input: { query: 'AFFiNE' },
    }),
    parser.parse({
      type: 'tool-result',
      toolCallId: 'call-1',
      toolName: 'web_search_exa',
      input: { query: 'AFFiNE' },
      output: [{ title: 'AFFiNE', url: 'https://affine.pro' }],
    }),
    parser.parse({ type: 'text-delta', text: 'Answer' }),
  ].join('');

  t.true(output.includes('Think'));
  t.true(output.includes('Searching the web "AFFiNE"'));
  t.true(output.includes('[AFFiNE](https://affine.pro)'));
  t.true(output.endsWith('\nAnswer'));
  t.throws(
    () => parser.parse({ type: 'error', error: { message: 'failed' } }),
    { message: 'failed' }
  );
});

test('history prompt preload excludes system messages and precedes durable history', t => {
  const projector = new HistoryPromptPreloadProjector({
    finish: () => [
      { role: 'system', content: 'hidden system' },
      { role: 'user', content: 'preloaded question' },
    ],
  } as unknown as PromptService);
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const history = {
    conversation: {
      id: 'session-1',
      userId: 'user-1',
      workspaceId: 'workspace-1',
      docId: 'doc-1',
      pinned: false,
      parentId: null,
      title: null,
      createdAt,
      updatedAt: createdAt,
    },
    prompt,
    turns: [
      turn('session-1', 'user', 'hello', { metadata: { tone: 'brief' } }),
    ],
  };

  t.deepEqual(
    projector.project(history, true, true).map(item => item.content),
    ['preloaded question']
  );
  t.deepEqual(projector.project(history, true, false), []);
  t.true(projector.project(history, true, true)[0].createdAt! < createdAt);
});

test('title policy and cron scheduling retain background-job invariants', async t => {
  const policy = new ConversationPolicy({} as Models, {} as never);
  t.true(
    policy.shouldGenerateTitle({
      title: null,
      turns: [
        turn('session-1', 'user', 'Question'),
        turn('session-1', 'assistant', 'Answer'),
      ],
    })
  );
  t.false(
    policy.shouldGenerateTitle({
      title: 'Existing',
      turns: [turn('session-1', 'user', 'Question')],
    })
  );

  const calls: unknown[][] = [];
  const jobs = {
    add: async (...args: unknown[]) => calls.push(args),
  } as unknown as JobQueue;
  const models = {
    copilotSession: {
      toBeGenerateTitle: async () => [{ id: 'session-1' }, { id: 'session-2' }],
    },
  } as unknown as Models;
  const cron = new CopilotCronJobs(models, jobs);

  await cron.dailyCleanupJob();
  await cron.generateMissingTitles();
  t.deepEqual(calls, [
    [
      'copilot.session.cleanupEmptySessions',
      {},
      { jobId: 'daily-copilot-cleanup-empty-sessions' },
    ],
    [
      'copilot.session.generateMissingTitles',
      {},
      { jobId: 'daily-copilot-generate-missing-titles' },
    ],
    [
      'copilot.workspace.cleanupTrashedDocEmbeddings',
      {},
      { jobId: 'daily-copilot-cleanup-trashed-doc-embeddings' },
    ],
    [
      'copilot.session.generateTitle',
      { sessionId: 'session-1' },
      { priority: 100 },
    ],
    [
      'copilot.session.generateTitle',
      { sessionId: 'session-2' },
      { priority: 100 },
    ],
  ]);
});

test('controller projects successful streams and preparation failures to SSE events', async t => {
  const request = { socket: new EventEmitter() } as never;
  const orchestrator = {
    streamText: async () => ({
      messageId: 'message-1',
      model: 'route-selected',
      finalMessage: [],
      stream: (async function* () {
        yield 'hello';
      })(),
    }),
  } as unknown as TurnOrchestrator;
  const actions = {
    stream: async () => {
      throw new Error('action preparation failed');
    },
  } as unknown as ActionStreamHost;
  const controller = new CopilotController(
    { copilot: { unsplash: {} } } as Config,
    orchestrator,
    actions,
    {} as CopilotStorage
  );

  t.deepEqual(
    await firstValueFrom(
      await controller.chatStream(
        { id: 'user-1' } as never,
        request,
        'session-1',
        {}
      )
    ),
    { type: 'message', id: 'message-1', data: 'hello' }
  );
  t.like(
    await firstValueFrom(
      await controller.actionStream(
        { id: 'user-1' } as never,
        request,
        'session-1',
        {}
      )
    ),
    { type: 'error' }
  );
});
