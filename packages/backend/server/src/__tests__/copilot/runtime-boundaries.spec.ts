import { EventEmitter } from 'node:events';

import type { DelegatedToolRequest } from '@affine/realtime';
import type { PrismaClient } from '@prisma/client';
import ava from 'ava';
import { firstValueFrom } from 'rxjs';

import {
  AccessDenied,
  type Config,
  type EventBus,
  type JobQueue,
  SearchProviderUnavailable,
} from '../../base';
import { ServerFeature, type ServerService } from '../../core';
import type { DocReader } from '../../core/doc';
import type { PermissionAccess } from '../../core/permission';
import { type RealtimePublisher, RealtimeRegistry } from '../../core/realtime';
import type { CanvasProjectionV1 } from '../../core/utils/blocksuite';
import type { Models } from '../../models';
import { HistoryPromptPreloadProjector } from '../../plugins/copilot/compat/history-prompt-preload-projector';
import { CopilotController } from '../../plugins/copilot/controller';
import { ConversationPolicy } from '../../plugins/copilot/conversation/policy';
import {
  chatMessageFromTurn,
  promptMessageFromTurn,
  type Turn,
  turnFromChatMessage,
} from '../../plugins/copilot/core';
import { CopilotCronJobs } from '../../plugins/copilot/cron';
import { DelegatedEditorRealtimeProvider } from '../../plugins/copilot/delegated/realtime';
import { DelegatedEditorService } from '../../plugins/copilot/delegated/service';
import type { NativeEmbeddingService } from '../../plugins/copilot/embedding/native';
import {
  CopilotFeatureGuard,
  CopilotFeatureService,
} from '../../plugins/copilot/feature';
import type { PromptService } from '../../plugins/copilot/prompt';
import type { ResolvedPrompt } from '../../plugins/copilot/prompt/spec';
import { TextStreamParser } from '../../plugins/copilot/providers/utils';
import { ArtifactRetrievalService } from '../../plugins/copilot/retrieval/artifact';
import { DocumentRetrievalService } from '../../plugins/copilot/retrieval/document';
import {
  projectActionEventToChatEvent,
  projectActionResultToAssistantTurn,
} from '../../plugins/copilot/runtime/action-output-projector';
import type { ActionStreamHost } from '../../plugins/copilot/runtime/hosts/action-stream-host';
import {
  collectAttachmentFootnotes,
  collectDocumentFootnotes,
  formatAttachmentFootnotes,
  formatDocumentFootnotes,
} from '../../plugins/copilot/runtime/tool/footnotes';
import { NativeProviderAdapter } from '../../plugins/copilot/runtime/tool/native-adapter';
import type { TurnOrchestrator } from '../../plugins/copilot/runtime/turn-orchestrator';
import {
  ChatSession,
  type ChatSessionService,
} from '../../plugins/copilot/session';
import type { CopilotStorage } from '../../plugins/copilot/storage';
import {
  createArtifactReadTool,
  createArtifactSearchTool,
} from '../../plugins/copilot/tools/artifact';
import { buildDocCanvasGetter } from '../../plugins/copilot/tools/doc-canvas-read';
import { buildDocumentSearch } from '../../plugins/copilot/tools/doc-search';
import type { IndexerService } from '../../plugins/indexer/service';

const test = ava;

test('delegated editor requests require exact identity and cancel on interruption', async t => {
  const published: Array<{ event: Record<string, unknown> }> = [];
  const publisher = {
    publish: (
      _topic: string,
      _input: unknown,
      event: Record<string, unknown>
    ) => published.push({ event }),
  } as unknown as RealtimePublisher;
  const delegated = new DelegatedEditorService(publisher);
  delegated.upsert('user-1', 'connection-1', {
    clientId: 'client-1',
    sessionId: 'session-1',
    workspaceId: 'workspace-1',
    docId: 'doc-1',
    editorStateId: 'state-1',
    mode: 'page',
    readonly: false,
    focused: true,
    capabilities: ['frontend_get_editor_state', 'frontend_read_selection'],
  });

  const result = delegated.execute(
    {
      user: 'user-1',
      session: 'session-1',
      workspace: 'workspace-1',
    },
    'frontend_get_editor_state',
    {},
    undefined,
    {
      runId: '3e476e0f-5841-4ab5-afca-610eca612ef1',
      toolCallId: 'call_provider_1',
    }
  );
  const request = published[0].event as unknown as DelegatedToolRequest;
  t.is(request.toolCallId, 'call_provider_1');
  const registry = new RealtimeRegistry();
  new DelegatedEditorRealtimeProvider(
    registry,
    { broadcast: () => {} } as unknown as EventBus,
    {} as ChatSessionService,
    delegated
  ).onModuleInit();
  t.notThrows(() =>
    registry.getRequest('copilot.delegated.tool.respond').input.parse({
      requestId: request.requestId,
      runId: request.runId,
      toolCallId: request.toolCallId,
      sessionId: request.sessionId,
      workspaceId: request.workspaceId,
      docId: request.docId,
      clientId: request.clientId,
      editorStateId: request.editorStateId,
      result: { mode: 'page' },
    })
  );
  t.false(
    delegated.receive('user-1', {
      ...request,
      editorStateId: 'stale-state',
      result: { mode: 'page' },
    })
  );
  t.false(
    delegated.receive('user-1', {
      ...request,
      workspaceId: 'workspace-2',
      result: { editor_state_id: 'state-1', mode: 'page' },
    })
  );
  t.true(
    delegated.receive('user-1', {
      ...request,
      result: { editor_state_id: 'state-1', mode: 'page' },
    })
  );
  t.deepEqual(await result, {
    editor_state_id: 'state-1',
    mode: 'page',
  });

  const selection = delegated.execute(
    {
      user: 'user-1',
      session: 'session-1',
      workspace: 'workspace-1',
    },
    'frontend_read_selection',
    {}
  );
  const selectionRequest = published.at(-1)
    ?.event as unknown as DelegatedToolRequest;
  t.true(
    delegated.receive('user-1', {
      ...selectionRequest,
      result: { editor_state_id: 'state-1', text: 'live content' },
    })
  );
  t.deepEqual(await selection, {
    editor_state_id: 'state-1',
    text: 'live content',
    source: {
      type: 'document',
      workspace_id: 'workspace-1',
      doc_id: 'doc-1',
      revision: 'state-1',
    },
  });

  const controller = new AbortController();
  const aborted = delegated.execute(
    {
      user: 'user-1',
      session: 'session-1',
      workspace: 'workspace-1',
    },
    'frontend_get_editor_state',
    {},
    controller.signal
  );
  controller.abort();
  t.like(await aborted, { error: { code: 'ABORTED', retryable: false } });
  t.is(published.at(-1)?.event.type, 'cancel');

  const preAbortedController = new AbortController();
  preAbortedController.abort();
  const preAborted = await delegated.execute(
    {
      user: 'user-1',
      session: 'session-1',
      workspace: 'workspace-1',
    },
    'frontend_get_editor_state',
    {},
    preAbortedController.signal
  );
  t.like(preAborted, { error: { code: 'ABORTED', retryable: false } });

  const disconnected = delegated.execute(
    {
      user: 'user-1',
      session: 'session-1',
      workspace: 'workspace-1',
    },
    'frontend_get_editor_state',
    {}
  );
  delegated.onDisconnect({ connectionId: 'connection-1' });
  t.like(await disconnected, {
    error: { code: 'FRONTEND_DISCONNECTED', retryable: true },
  });
  t.like(published.at(-1)?.event, { type: 'cancel', reason: 'disconnect' });
});

test('canvas reads expose top-level and frame-owned canvas blocks', async t => {
  const projection: CanvasProjectionV1 = {
    version: 1,
    docId: 'doc-1',
    revision: 'revision-1',
    title: 'Canvas',
    counts: {},
    warnings: [],
    blocks: [
      {
        id: 'page-1',
        type: 'paragraph',
        visibility: 'page',
        text: 'Page only',
        childIds: [],
      },
      {
        id: 'frame-1',
        type: 'frame',
        visibility: 'edgeless',
        childIds: ['edgeless-1', 'shape-1'],
      },
      {
        id: 'edgeless-1',
        type: 'edgeless-text',
        visibility: 'edgeless',
        text: 'Frame text',
        childIds: [],
      },
      {
        id: 'edgeless-2',
        type: 'edgeless-text',
        visibility: 'edgeless',
        text: 'Top-level text',
        childIds: [],
      },
    ],
    elements: [
      { id: 'shape-1', type: 'shape', frameId: 'frame-1', childIds: [] },
      { id: 'shape-2', type: 'shape', childIds: [] },
    ],
  };
  const getter = buildDocCanvasGetter(
    {
      user: () => ({
        workspace: () => ({ doc: () => ({ can: async () => true }) }),
      }),
    } as unknown as PermissionAccess,
    { getDocCanvas: async () => projection } as unknown as DocReader,
    {
      workspace: { get: async () => ({ id: 'workspace-1' }) },
    } as unknown as Models
  );
  const options = { user: 'user-1', workspace: 'workspace-1' };
  const overview = await getter(
    options,
    'doc-1',
    { kind: 'overview' },
    undefined,
    50
  );
  t.deepEqual(
    'blocks' in overview ? overview.blocks.map(block => block.id) : [],
    ['edgeless-2', 'frame-1']
  );
  t.deepEqual(
    'elements' in overview ? overview.elements.map(element => element.id) : [],
    ['shape-2']
  );

  const frame = await getter(
    options,
    'doc-1',
    { kind: 'frame', frame_id: 'frame-1' },
    undefined,
    50
  );
  t.deepEqual('blocks' in frame ? frame.blocks.map(block => block.id) : [], [
    'edgeless-1',
    'frame-1',
  ]);
  t.deepEqual(
    'elements' in frame ? frame.elements.map(element => element.id) : [],
    ['shape-1']
  );

  const scopedGetter = buildDocCanvasGetter(
    {} as PermissionAccess,
    {} as DocReader,
    {} as Models,
    { mode: 'selected', allowedDocIds: ['doc-2'] }
  );
  const outsideScope = await scopedGetter(
    options,
    'doc-1',
    { kind: 'overview' },
    undefined,
    50
  );
  t.like(outsideScope, { code: 'DOC_SCOPE_DENIED' });
});

test('document tools enforce the user-selected hard scope', async t => {
  const hit = {
    docId: 'doc-1',
    title: 'Doc',
    excerpt: 'excerpt',
    visibility: 'page' as const,
    score: 1,
    unitId: 'block:1',
  };
  const searchCalls: Array<string[] | undefined> = [];
  const retrieval = {
    search: async (
      _options: unknown,
      _query: string,
      docIds: string[] | undefined,
      _limit: number
    ) => {
      searchCalls.push(docIds);
      return {
        retrievalMode: 'hybrid',
        degradedReason: undefined,
        hits: [hit],
      };
    },
  } as unknown as DocumentRetrievalService;
  const options = { user: 'user-1', workspace: 'workspace-1' };

  const readableAc = {
    user: () => ({
      workspace: () => ({
        docs: async <T extends { docId: string }>(candidates: T[]) =>
          candidates.filter(candidate => candidate.docId !== 'hidden-doc'),
      }),
    }),
  } as unknown as PermissionAccess;
  const documentModels = {
    doc: {
      findMetas: async (ids: Array<{ docId: string }>) =>
        ids.map(({ docId }) => ({
          docId,
          title: `title-${docId}`,
          updatedAt: new Date(1),
        })),
    },
  } as unknown as Models;
  const lexicalIndexer = {
    searchDocsByKeyword: async () => [
      {
        docId: 'shared-doc',
        title: 'Lexical title',
        highlight: 'lexical passage',
        unitId: 'block:shared',
        visibility: 'page',
        projectionVersion: '1',
        sourceHash: 'hash',
      },
    ],
  } as unknown as IndexerService;
  const vectorSearch = {
    canEmbedding: true,
    matchWorkspaceDocCandidates: async () => [
      {
        docId: 'shared-doc',
        chunk: 0,
        content: 'vector passage',
        distance: 0.1,
        unitId: 'block:shared',
        visibility: 'page' as const,
      },
      {
        docId: 'hidden-doc',
        chunk: 0,
        content: 'hidden passage',
        distance: 0.2,
        unitId: 'block:hidden',
        visibility: 'page' as const,
      },
    ],
    rerankWorkspaceDocs: async (
      _workspaceId: string,
      _query: string,
      candidates: Array<{
        docId: string;
        chunk: number;
        content: string;
        distance: number;
        unitId: string;
        visibility: 'page';
      }>
    ) => candidates,
  };
  const hybrid = new DocumentRetrievalService(
    readableAc,
    lexicalIndexer,
    vectorSearch,
    documentModels
  );
  const hybridResult = await hybrid.search(options, 'query', undefined, 10);
  t.is(hybridResult.retrievalMode, 'hybrid');
  t.deepEqual(
    hybridResult.hits.map(result => result.docId),
    ['shared-doc']
  );
  t.true(hybridResult.hits[0].score > 1 / 61);

  const lexicalOnly = new DocumentRetrievalService(
    readableAc,
    lexicalIndexer,
    { ...vectorSearch, canEmbedding: false },
    documentModels
  );
  const lexicalResult = await lexicalOnly.search(
    options,
    'query',
    undefined,
    10
  );
  t.is(lexicalResult.retrievalMode, 'lexical');
  t.is(lexicalResult.degradedReason, 'VECTOR_UNAVAILABLE');

  const vectorOnly = new DocumentRetrievalService(
    readableAc,
    {
      searchDocsByKeyword: async () => {
        throw new SearchProviderUnavailable();
      },
    } as unknown as IndexerService,
    vectorSearch,
    documentModels
  );
  const vectorResult = await vectorOnly.search(options, 'query', undefined, 10);
  t.is(vectorResult.retrievalMode, 'vector');
  t.is(vectorResult.degradedReason, 'LEXICAL_UNAVAILABLE');
  t.deepEqual(
    vectorResult.hits.map(result => result.docId),
    ['shared-doc']
  );

  // model omits doc_ids: pinned scope applies
  let search = buildDocumentSearch(retrieval, options, {
    mode: 'selected',
    allowedDocIds: ['pinned-1'],
  });
  let result: any = await search('query', undefined, 10);
  t.deepEqual(searchCalls.pop(), ['pinned-1']);
  t.is(result.hits[0].doc_id, 'doc-1');
  t.is(result.hits[0].source.doc_id, 'doc-1');

  // model-provided ids cannot replace the complete user-selected scope
  search = buildDocumentSearch(retrieval, options, {
    mode: 'selected',
    allowedDocIds: ['pinned-1'],
  });
  result = await search('query', ['other-1'], 10);
  t.deepEqual(searchCalls.pop(), ['pinned-1']);
  t.is(result.hits[0].doc_id, 'doc-1');

  // an empty array keeps the pinned scope
  search = buildDocumentSearch(retrieval, options, {
    mode: 'selected',
    allowedDocIds: ['pinned-1'],
  });
  await search('query', [], 10);
  t.deepEqual(searchCalls.pop(), ['pinned-1']);

  // an explicitly selected empty category remains an empty hard scope
  search = buildDocumentSearch(retrieval, options, {
    mode: 'selected',
    allowedDocIds: [],
  });
  result = await search('query', undefined, 10);
  t.is(searchCalls.length, 0);
  t.is(result.scope_mode, 'selected');
  t.is(result.scope_doc_count, 0);
  t.deepEqual(result.hits, []);

  // no pinned scope: omission searches the whole workspace
  search = buildDocumentSearch(retrieval, options);
  await search('query', undefined, 10);
  t.is(searchCalls.pop(), undefined);

  // missing identity is a non-retryable tool error
  const unauthenticated: any = await buildDocumentSearch(retrieval, undefined, {
    mode: 'selected',
    allowedDocIds: ['pinned-1'],
  })('query', undefined, 10);
  t.is(unauthenticated.code, 'INVALID_CONTEXT');
  t.is(searchCalls.length, 0);

  const artifactCalls: Array<{
    kind: string;
    sourceKey?: string;
    requiredArtifactIds: string[];
  }> = [];
  const artifactScope = {
    mode: 'required' as const,
    requiredDocIds: [],
    requiredArtifactIds: ['6ba7b810-9dad-11d1-80b4-00c04fd430c8'],
    preferredSourceIds: [],
  };
  const artifactEmbedding = {
    match: async (
      _workspaceId: string,
      _query: string,
      kind: string,
      retrievalScope: typeof artifactScope,
      _limit: number,
      signal?: AbortSignal
    ) => {
      signal?.throwIfAborted();
      artifactCalls.push({
        kind,
        requiredArtifactIds: retrievalScope.requiredArtifactIds,
      });
      return [];
    },
    readSourceContent: async (
      _workspaceId: string,
      kind: string,
      sourceKey: string,
      retrievalScope: typeof artifactScope
    ) => {
      artifactCalls.push({
        kind,
        sourceKey,
        requiredArtifactIds: retrievalScope.requiredArtifactIds,
      });
      if (!retrievalScope.requiredArtifactIds.includes(sourceKey)) {
        throw new Error('embedding_source_out_of_scope');
      }
      return {
        content: 'artifact body',
        revision: 'revision-1',
        mimeType: 'text/plain',
        name: 'note.txt',
        truncated: false,
      };
    },
  } as unknown as NativeEmbeddingService;
  const artifactRetrieval = new ArtifactRetrievalService(
    {
      user: () => ({
        workspace: () => ({
          allowLocal: () => ({ can: async () => true }),
        }),
      }),
    } as unknown as PermissionAccess,
    artifactEmbedding,
    {
      workspaceArtifact: {
        findMany: async () => [
          {
            id: artifactScope.requiredArtifactIds[0],
            displayName: null,
            canonicalMediaType: 'text/plain',
          },
        ],
      },
      aiMessageArtifact: {
        findMany: async () => [
          {
            artifactId: artifactScope.requiredArtifactIds[0],
            displayName: 'original-note.txt',
          },
        ],
      },
    } as unknown as PrismaClient
  );
  const artifactOptions = {
    user: 'user-1',
    workspace: 'workspace-1',
    billingUnitId: 'message-1',
    retrievalScope: artifactScope,
  };
  const artifactSearch = createArtifactSearchTool(
    artifactRetrieval,
    artifactOptions
  );
  const artifactSearchResult = await artifactSearch.execute?.(
    { query: 'query' },
    {}
  );
  t.deepEqual(artifactCalls.shift(), {
    kind: 'artifact',
    requiredArtifactIds: artifactScope.requiredArtifactIds,
  });
  t.deepEqual(artifactCalls.shift(), {
    kind: 'artifact',
    sourceKey: artifactScope.requiredArtifactIds[0],
    requiredArtifactIds: artifactScope.requiredArtifactIds,
  });
  t.like(artifactSearchResult, {
    hits: [
      {
        excerpt: 'artifact body',
        source: { type: 'artifact', name: 'original-note.txt' },
      },
    ],
  });

  const artifactRead = createArtifactReadTool(
    artifactRetrieval,
    artifactOptions
  );
  const artifactReadResult = await artifactRead.execute?.(
    { artifact_id: artifactScope.requiredArtifactIds[0] },
    {}
  );
  t.like(artifactReadResult, {
    source: {
      artifact_id: artifactScope.requiredArtifactIds[0],
      name: 'original-note.txt',
    },
  });
  const fallbackArtifactRetrieval = new ArtifactRetrievalService(
    {
      user: () => ({
        workspace: () => ({
          allowLocal: () => ({ can: async () => true }),
        }),
      }),
    } as unknown as PermissionAccess,
    artifactEmbedding,
    {
      workspaceArtifact: { findMany: async () => [] },
      aiMessageArtifact: { findMany: async () => [] },
    } as unknown as PrismaClient
  );
  t.like(
    await fallbackArtifactRetrieval.read({
      userId: 'user-1',
      workspaceId: 'workspace-1',
      artifactId: artifactScope.requiredArtifactIds[0],
      retrieval: artifactScope,
    }),
    { name: 'note.txt', mimeType: 'text/plain' }
  );
  const deniedArtifactRetrieval = new ArtifactRetrievalService(
    {
      user: () => ({
        workspace: () => ({
          allowLocal: () => ({ can: async () => false }),
        }),
      }),
    } as unknown as PermissionAccess,
    artifactEmbedding,
    {} as PrismaClient
  );
  await t.throwsAsync(
    deniedArtifactRetrieval.read({
      userId: 'user-1',
      workspaceId: 'workspace-1',
      artifactId: artifactScope.requiredArtifactIds[0],
      retrieval: artifactScope,
    }),
    { instanceOf: AccessDenied }
  );
  const deniedArtifactRead = await artifactRead.execute?.(
    { artifact_id: '6ba7b811-9dad-11d1-80b4-00c04fd430c8' },
    {}
  );
  t.like(deniedArtifactRead, { code: 'ARTIFACT_UNAVAILABLE' });

  const abortedSearch = new AbortController();
  abortedSearch.abort();
  await t.throwsAsync(
    artifactRetrieval.search({
      userId: 'user-1',
      workspaceId: 'workspace-1',
      query: 'query',
      retrieval: artifactScope,
      limit: 5,
      signal: abortedSearch.signal,
    }),
    { name: 'AbortError' }
  );
});

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
      focus: { selectors: [] },
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
      attachments: undefined,
      params: { word: 'world' },
    },
  ]);

  await session.save();
  t.is(session.stashTurns.length, 0);
  t.deepEqual(
    saved[0].map(item => item.content),
    ['answer']
  );
  t.deepEqual(saved[0][0].attachments, [
    {
      kind: 'file_handle',
      fileHandle: 'file-1',
      mimeType: 'application/pdf',
    },
  ]);

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
    scopeSnapshot: undefined,
    streamObjects: converted.renderTrace,
  });

  t.deepEqual(
    promptMessageFromTurn({
      ...converted,
      attachments: [
        {
          attachment: 'data:text/plain;base64,dGV4dA==',
          mimeType: 'text/plain',
        },
        { attachment: 'data:image/png;base64,aW1hZ2U=', mimeType: 'image/png' },
      ],
    }).attachments,
    [{ attachment: 'data:image/png;base64,aW1hZ2U=', mimeType: 'image/png' }]
  );
});

test('action output projection preserves public SSE and assistant-turn contracts', t => {
  const session = new ChatSession(
    {
      sessionId: 'session-1',
      userId: 'user-1',
      workspaceId: 'workspace-1',
      docId: 'doc-1',
      focus: { selectors: [] },
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
  t.is(
    formatDocumentFootnotes([
      {
        type: 'document',
        workspace_id: 'workspace-1',
        doc_id: 'doc-1',
        title: 'Getting Started',
        revision: 'revision-1',
        visibility: 'edgeless',
      },
      {
        type: 'document',
        workspace_id: 'workspace-1',
        doc_id: 'doc-1',
        title: 'Getting Started',
        revision: 'revision-1',
        visibility: 'edgeless',
        element_id: 'element-1',
      },
    ]),
    '\n\n[^doc-1]\n\n[^doc-1]: {"type":"doc","docId":"doc-1","title":"Getting Started"}'
  );
  t.is(
    formatAttachmentFootnotes([
      {
        artifactId: 'artifact-1',
        fileName: 'notes.txt',
        fileType: 'text/plain',
      },
    ]),
    '\n\n[^attachment-1]\n\n[^attachment-1]: {"type":"attachment","artifactId":"artifact-1","fileName":"notes.txt","fileType":"text/plain"}'
  );
  t.deepEqual(
    collectDocumentFootnotes({
      type: 'tool_result',
      call_id: 'call-1',
      name: 'frontend_read_selection',
      arguments: {},
      output: {
        source: {
          type: 'document',
          workspace_id: 'workspace-1',
          doc_id: 'doc-1',
          revision: 'state-1',
        },
      },
    }),
    [
      {
        type: 'document',
        workspace_id: 'workspace-1',
        doc_id: 'doc-1',
        title: '',
        revision: 'state-1',
        visibility: undefined,
        block_id: undefined,
        element_id: undefined,
        frame_id: undefined,
      },
    ]
  );
  t.deepEqual(
    collectAttachmentFootnotes({
      type: 'tool_result',
      call_id: 'call-2',
      name: 'artifact_search',
      arguments: {},
      output: {
        hits: [
          {
            source: {
              type: 'artifact',
              workspace_id: 'workspace-1',
              artifact_id: 'artifact-1',
            },
          },
        ],
      },
    }),
    [
      {
        artifactId: 'artifact-1',
        fileName: 'Attachment',
        fileType: 'application/octet-stream',
      },
    ]
  );
});

test('text stream parser keeps reasoning and tool output distinct from answer text', async t => {
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

  const adapter = new NativeProviderAdapter(async function* () {
    yield {
      type: 'citation',
      index: 1,
      url: 'https://affine.pro',
    };
    yield {
      type: 'tool_result',
      call_id: 'call-1',
      name: 'artifact_read',
      arguments: {},
      output: {
        artifactId: 'artifact-1',
        fileName: 'notes.txt',
        fileType: 'text/plain',
      },
    };
    yield {
      type: 'tool_result',
      call_id: 'call-2',
      name: 'frontend_read_selection',
      arguments: {},
      output: {
        text: 'live content',
        source: {
          type: 'document',
          workspace_id: 'workspace-1',
          doc_id: 'doc-1',
          revision: 'state-1',
        },
      },
    };
    yield { type: 'done' };
  });
  const streamObjects = [];
  for await (const item of adapter.streamObject({
    model: 'test',
    messages: [],
  })) {
    streamObjects.push(item);
  }
  t.deepEqual(streamObjects.at(-1), {
    type: 'text-delta',
    textDelta: '\n\n[^doc-1]\n\n[^doc-1]: {"type":"doc","docId":"doc-1"}',
  });
  const streamOutput = streamObjects
    .filter(item => item.type === 'text-delta')
    .map(item => item.textDelta)
    .join('');
  t.true(streamOutput.includes('"url":"https%3A%2F%2Faffine.pro"'));
  t.true(streamOutput.includes('[^attachment-1]'));
  t.true(streamOutput.includes('"artifactId":"artifact-1"'));

  const textAdapter = new NativeProviderAdapter(async function* () {
    yield {
      type: 'tool_result',
      call_id: 'call-1',
      name: 'artifact_read',
      arguments: {},
      output: {
        artifactId: 'artifact-1',
        fileName: 'notes.txt',
        fileType: 'text/plain',
      },
    };
    yield { type: 'done' };
  });
  let textOutput = '';
  for await (const chunk of textAdapter.streamText({
    model: 'test',
    messages: [],
  })) {
    textOutput += chunk;
  }
  t.true(textOutput.includes('[^attachment-1]'));
  t.true(textOutput.includes('"artifactId":"artifact-1"'));
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
  const cron = new CopilotCronJobs(models, jobs, {
    async reconcileDispatches() {},
  } as never);

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
