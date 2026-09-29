import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough, Readable } from 'node:stream';

import type { DelegatedToolRequest } from '@affine/realtime';
import type { PrismaClient } from '@prisma/client';
import ava from 'ava';
import type { Response } from 'express';
import { firstValueFrom } from 'rxjs';

import {
  AccessDenied,
  type Config,
  type EventBus,
  SearchProviderUnavailable,
} from '../../base';
import { ServerFeature, type ServerService } from '../../core';
import type { DocReader } from '../../core/doc';
import type { PermissionAccess } from '../../core/permission';
import { type RealtimePublisher, RealtimeRegistry } from '../../core/realtime';
import type { CanvasProjectionV1 } from '../../core/utils/blocksuite';
import type { Models } from '../../models';
import { CopilotAccessService } from '../../plugins/copilot/access';
import { CopilotAttachmentController } from '../../plugins/copilot/attachment-controller';
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
import { ChatMessageAttachment } from '../../plugins/copilot/providers/types';
import { TextStreamParser } from '../../plugins/copilot/providers/utils';
import { ArtifactRetrievalService } from '../../plugins/copilot/retrieval/artifact';
import { DocumentRetrievalService } from '../../plugins/copilot/retrieval/document';
import {
  projectActionEventToChatEvent,
  projectActionResultToAssistantTurn,
} from '../../plugins/copilot/runtime/action-output-projector';
import { ActionStreamHost } from '../../plugins/copilot/runtime/hosts/action-stream-host';
import { AttachmentAdmissionHost } from '../../plugins/copilot/runtime/hosts/attachment-admission';
import { ImageResultHost } from '../../plugins/copilot/runtime/hosts/image-result-host';
import {
  collectAttachmentFootnotes,
  collectDocumentFootnotes,
  formatAttachmentFootnotes,
  formatDocumentFootnotes,
} from '../../plugins/copilot/runtime/tool/footnotes';
import { NativeProviderAdapter } from '../../plugins/copilot/runtime/tool/native-adapter';
import { TurnOrchestrator } from '../../plugins/copilot/runtime/turn-orchestrator';
import {
  ChatSession,
  type ChatSessionService,
} from '../../plugins/copilot/session';
import { CopilotStorage } from '../../plugins/copilot/storage';
import {
  createArtifactReadTool,
  createArtifactSearchTool,
} from '../../plugins/copilot/tools/artifact';
import { buildDocCanvasGetter } from '../../plugins/copilot/tools/doc-canvas-read';
import { buildDocumentSearch } from '../../plugins/copilot/tools/doc-search';
import type { IndexerService } from '../../plugins/indexer/service';

const test = ava;

test('copilot personal scope never bypasses a canonical workspace decision', async t => {
  const workspaceExists = [false, true, true, false, true];
  const actorResources = [true, true];
  const queryTrace: string[] = [];
  const asserted: string[] = [];
  const access = new CopilotAccessService(
    {
      user: (userId: string) => ({
        workspace: (workspaceId: string) => ({
          assert: async (action: string) => {
            asserted.push(`${userId}:${workspaceId}:${action}`);
            if (userId === 'denied') throw new AccessDenied();
          },
          docs: async (items: unknown[]) => items,
        }),
        doc: ({
          workspaceId,
          docId,
        }: {
          workspaceId: string;
          docId: string;
        }) => ({
          assert: async (action: string) => {
            asserted.push(`${userId}:${workspaceId}:${docId}:${action}`);
          },
        }),
      }),
    } as unknown as PermissionAccess,
    {
      $executeRaw: async () => 1,
      $queryRaw: async (query: { strings?: readonly string[] }) => {
        const workspaceQuery = query.strings
          ?.join('')
          .includes('FROM workspaces');
        queryTrace.push(workspaceQuery ? 'workspace' : 'actor-resource');
        return workspaceQuery
          ? [{ exists: workspaceExists.shift() ?? true }]
          : [{ allowed: actorResources.shift() ?? false }];
      },
    } as unknown as PrismaClient
  );

  t.is(
    await access.sessionCollection({
      userId: 'user-1',
      workspaceId: 'workspace-1',
    }),
    'personal'
  );
  t.deepEqual(asserted, []);

  await access.sessionCollection({
    userId: 'user-1',
    workspaceId: 'workspace-1',
  });
  await access.sessionCollection({
    userId: 'user-1',
    workspaceId: 'workspace-1',
    docId: 'doc-1',
    action: 'Doc.Read',
  });
  t.deepEqual(asserted, [
    'user-1:workspace-1:Workspace.Copilot',
    'user-1:workspace-1:doc-1:Doc.Read',
  ]);
  await access.sessionResource(
    { userId: 'user-1', workspaceId: 'workspace-1' },
    ['session-1']
  );
  await t.throwsAsync(
    access.sessionResource({ userId: 'denied', workspaceId: 'workspace-1' }, [
      'session-1',
    ]),
    { instanceOf: AccessDenied }
  );
  t.snapshot({ queryTrace });
});

test('delegated editor requests require exact identity and cancel on interruption', async t => {
  const published: Array<{ event: Record<string, unknown> }> = [];
  const publisher = {
    publish: (
      _topic: string,
      _input: unknown,
      event: Record<string, unknown>
    ) => published.push({ event }),
  } as unknown as RealtimePublisher;
  let accessAllowed = true;
  let accessChecks = 0;
  const access = {
    sessionResource: async () => {
      accessChecks++;
      if (!accessAllowed) throw new AccessDenied();
      return 'canonical';
    },
  } as unknown as CopilotAccessService;
  const permission = {
    user: () => ({ workspace: () => ({ assert: async () => {} }) }),
  } as unknown as PermissionAccess;
  const delegated = new DelegatedEditorService(publisher, access, permission);
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
  await new Promise(resolve => setImmediate(resolve));
  const request = published[0].event as unknown as DelegatedToolRequest;
  t.is(request.toolCallId, 'call_provider_1');
  const registry = new RealtimeRegistry();
  const sessions = {
    getOwnedScope: async () => ({
      workspaceId: 'workspace-1',
      docId: 'doc-1',
    }),
    getInScope: async () => ({ config: { docId: 'doc-1' } }),
  } as unknown as ChatSessionService;
  new DelegatedEditorRealtimeProvider(
    registry,
    { broadcast: () => {} } as unknown as EventBus,
    sessions,
    delegated,
    access,
    permission
  ).onModuleInit();
  await registry.getRequest('copilot.delegated.editor.upsert').handle(
    { id: 'user-1' } as never,
    {
      clientId: 'client-1',
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
      docId: 'doc-1',
      editorStateId: 'state-1',
      mode: 'page',
      readonly: false,
      focused: true,
      capabilities: ['frontend_get_editor_state', 'frontend_read_selection'],
    },
    { connectionId: 'connection-1' }
  );
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
  await new Promise(resolve => setImmediate(resolve));
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
  await new Promise(resolve => setImmediate(resolve));
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
  await new Promise(resolve => setImmediate(resolve));
  delegated.onDisconnect({ connectionId: 'connection-1' });
  t.like(await disconnected, {
    error: { code: 'FRONTEND_DISCONNECTED', retryable: true },
  });
  t.like(published.at(-1)?.event, { type: 'cancel', reason: 'disconnect' });

  delegated.upsert('user-1', 'connection-2', {
    clientId: 'client-1',
    sessionId: 'session-1',
    workspaceId: 'workspace-1',
    docId: 'doc-1',
    editorStateId: 'state-2',
    mode: 'page',
    readonly: false,
    focused: true,
    capabilities: ['frontend_get_editor_state'],
  });
  accessAllowed = false;
  await t.throwsAsync(
    registry.getRequest('copilot.delegated.editor.upsert').handle(
      { id: 'user-1' } as never,
      {
        clientId: 'client-1',
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
        docId: 'doc-1',
        editorStateId: 'state-2',
        mode: 'page',
        readonly: false,
        focused: true,
        capabilities: ['frontend_get_editor_state'],
      },
      { connectionId: 'connection-2' }
    ),
    { instanceOf: AccessDenied }
  );
  await t.throwsAsync(
    delegated.execute(
      {
        user: 'user-1',
        session: 'session-1',
        workspace: 'workspace-1',
      },
      'frontend_get_editor_state',
      {}
    ),
    { instanceOf: AccessDenied }
  );
  t.is(accessChecks, 8);
  t.is(published.length, 8);
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
  const readDocIds: string[] = [];
  const docReader = {
    getDocMarkdown: async (_workspaceId: string, docId: string) => {
      readDocIds.push(docId);
      if (docId === 'missing-doc') return null;
      return {
        title: docId,
        markdown: docId.startsWith('long-doc')
          ? 'a'.repeat(25_000)
          : `${docId} content`,
        revision: '1',
      };
    },
  } as unknown as DocReader;
  const hybrid = new DocumentRetrievalService(
    readableAc,
    lexicalIndexer,
    vectorSearch,
    documentModels,
    docReader
  );
  const hybridResult = await hybrid.search(options, 'query', undefined, 10);
  t.is(hybridResult.retrievalMode, 'hybrid');
  t.deepEqual(
    hybridResult.hits.map(result => result.docId),
    ['shared-doc']
  );
  t.true(hybridResult.hits[0].score > 1 / 61);
  const healthyScoped = await hybrid.search(
    options,
    'query',
    ['shared-doc'],
    10
  );
  t.is(healthyScoped.retrievalMode, 'hybrid');
  t.deepEqual(readDocIds, []);

  const lexicalOnly = new DocumentRetrievalService(
    readableAc,
    lexicalIndexer,
    { ...vectorSearch, canEmbedding: false },
    documentModels,
    docReader
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
    documentModels,
    docReader
  );
  const vectorResult = await vectorOnly.search(options, 'query', undefined, 10);
  t.is(vectorResult.retrievalMode, 'vector');
  t.is(vectorResult.degradedReason, 'LEXICAL_UNAVAILABLE');
  t.deepEqual(
    vectorResult.hits.map(result => result.docId),
    ['shared-doc']
  );
  t.deepEqual(readDocIds, []);
  const unavailable = new DocumentRetrievalService(
    readableAc,
    {
      searchDocsByKeyword: async () => {
        throw new SearchProviderUnavailable();
      },
    } as unknown as IndexerService,
    {
      ...vectorSearch,
      matchWorkspaceDocCandidates: async () => {
        throw new Error('embedding_unavailable');
      },
    },
    documentModels,
    docReader
  );
  await t.throwsAsync(unavailable.search(options, 'query', undefined, 10), {
    message: 'SEARCH_UNAVAILABLE',
  });
  const scoped = await unavailable.search(
    options,
    'query',
    ['cat-doc', 'hidden-doc', 'dog-doc', 'cat-doc'],
    10
  );
  t.like(scoped, {
    retrievalMode: 'scoped',
    degradedReason: 'SEARCH_UNAVAILABLE',
  });
  t.deepEqual(readDocIds, ['cat-doc', 'dog-doc']);
  t.deepEqual(
    scoped.hits.map(hit => [hit.docId, hit.excerpt]),
    [
      ['cat-doc', 'cat-doc content'],
      ['dog-doc', 'dog-doc content'],
    ]
  );
  readDocIds.length = 0;
  await unavailable.search(options, 'query', ['cat-doc', 'dog-doc'], 1);
  t.deepEqual(readDocIds, ['cat-doc']);
  const bounded = await unavailable.search(options, 'query', ['long-doc'], 1);
  t.is(bounded.hits[0].excerpt.length, 20_000);
  const boundedMultiple = await unavailable.search(
    options,
    'query',
    ['long-doc-1', 'long-doc-2'],
    2
  );
  t.deepEqual(
    boundedMultiple.hits.map(hit => hit.excerpt.length),
    [10_000, 10_000]
  );
  await t.throwsAsync(
    unavailable.search(options, 'query', ['missing-doc'], 1),
    {
      message: 'SEARCH_UNAVAILABLE',
    }
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
          can: async () => true,
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
          can: async () => true,
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
          can: async () => false,
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

test('chat session preserves prompt params, attachments and revert semantics', t => {
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
    ]
  );

  session.pushPersistedTurn(
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

  session.pushPersistedTurn(turn('session-1', 'user', 'retry'));
  session.pushPersistedTurn(turn('session-1', 'assistant', 'retry answer'));
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

test('title policy and cron retain background-work invariants', async t => {
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
  t.true(policy.shouldScheduleTitle({ action: undefined }));
  t.false(policy.shouldScheduleTitle({ action: 'edit' }));
  t.is(
    policy.buildTitlePromptContent([
      turn('session-1', 'system', 'Ignored system context'),
      turn('session-1', 'user', 'First question'),
      turn('session-1', 'assistant', 'First answer'),
      turn('session-1', 'user', 'Ignored follow-up'),
      turn('session-1', 'assistant', 'Ignored follow-up answer'),
    ]),
    '[user]: First question\n[assistant]: First answer'
  );

  const calls: unknown[] = [];
  const models = {
    copilotSession: {
      cleanupEmptySessions: async () => ({ removed: 0, cleaned: 0 }),
      toBeGenerateTitle: async () => [
        {
          id: 'session-1',
          userId: 'user-1',
          workspaceId: 'workspace-1',
        },
        {
          id: 'session-2',
          userId: 'user-2',
          workspaceId: 'workspace-2',
        },
      ],
    },
  } as unknown as Models;
  const cron = new CopilotCronJobs(
    models,
    {
      async generateSessionTitle(input: unknown) {
        calls.push(input);
      },
    } as never,
    {} as never,
    {
      async collectPendingDispatches() {
        return [];
      },
    } as never
  );

  await cron.dailyCleanupJob();
  t.deepEqual(calls, []);
  await cron.generateMissingTitles();
  t.snapshot(calls);
});

test.serial(
  'copilot storage deletes objects when result signing fails',
  async t => {
    const mutableEnv = globalThis.env as unknown as { NODE_ENV: string };
    const previous = mutableEnv.NODE_ENV;
    mutableEnv.NODE_ENV = 'production';
    t.teardown(() => {
      mutableEnv.NODE_ENV = previous;
    });
    const deleted: string[] = [];
    const written: string[] = [];
    let signing: 'missing' | 'error' = 'missing';
    const runtime = {
      putObject: async (_scope: string, key: string) => written.push(key),
      presignGet: async (_scope: string, _key: string) => {
        if (signing === 'error') throw new Error('signer unavailable');
        return undefined;
      },
      deleteObject: async (_scope: string, key: string) => deleted.push(key),
    };
    const storage = new CopilotStorage(runtime as never);

    const missingSigner = await t.throwsAsync(
      storage.put(
        'user-1',
        'workspace-1',
        'missing',
        Buffer.from('safe'),
        'text/plain'
      )
    );
    signing = 'error';
    const failedSigner = await t.throwsAsync(
      storage.put(
        'user-1',
        'workspace-1',
        'failed',
        Buffer.from('safe'),
        'text/plain'
      )
    );

    t.snapshot({
      missing: missingSigner?.message,
      failed: failedSigner?.message,
      written,
      deleted,
    });
  }
);

test.serial(
  'copilot image artifacts require canonical scoped storage',
  async t => {
    const mutableEnv = globalThis.env as unknown as { NODE_ENV: string };
    const previous = mutableEnv.NODE_ENV;
    mutableEnv.NODE_ENV = 'production';
    t.teardown(() => {
      mutableEnv.NODE_ENV = previous;
    });
    const written: string[] = [];
    const storage = new CopilotStorage({
      putObject: async (_scope: string, key: string) => written.push(key),
      presignGet: async (_scope: string, key: string) => ({
        url: `https://signed.invalid/${key}`,
      }),
    } as never);

    const session = new ChatSession(
      {
        sessionId: 'session-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        docId: null,
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
    let scopeMode: 'canonical' | 'personal' = 'canonical';
    const imageResults = new ImageResultHost(storage);
    const orchestrator = new TurnOrchestrator(
      {
        prepareTurn: async () => ({
          params: {},
          session,
          scopeMode,
        }),
        buildLatestTurnPromptParams: () => ({}),
      } as never,
      {
        streamImageArtifacts: () =>
          (async function* () {
            yield { data_base64: 'aW1hZ2U=', media_type: 'image/png' };
          })(),
      } as never,
      imageResults,
      { persistImageResult: async () => {} } as never,
      { prepareSelectedDocuments: async () => {} } as never
    );
    const canonical = await orchestrator.streamImages(
      'user-1',
      'session-1',
      {}
    );
    const generated: string[] = [];
    for await (const url of canonical.stream) generated.push(url);
    scopeMode = 'personal';
    const personalRequest = await t.throwsAsync(
      orchestrator.streamImages('user-1', 'session-1', {})
    );
    const personalAction = await t.throwsAsync(
      new ActionStreamHost(
        {
          prepareTurn: async () => ({
            params: {},
            session,
            scopeMode: 'personal',
          }),
          buildLatestTurnPromptParams: () => ({}),
        } as never,
        { runStream: () => t.fail('personal action reached runtime') } as never,
        {
          get: async () => ({}),
          finish: () => [],
        } as never,
        imageResults
      ).stream('user-1', 'session-1', {
        actionId: 'image.filter.sketch',
        actionVersion: 'v1',
      })
    );
    const personalHost = await t.throwsAsync(
      imageResults.persistNativeArtifact(
        'user-1',
        'workspace-1',
        { data_base64: 'aW1hZ2U=', media_type: 'image/png' },
        'personal'
      )
    );

    t.snapshot({
      canonical: { generated, written },
      personal: {
        request: personalRequest?.message,
        action: personalAction?.message,
        host: personalHost?.message,
      },
    });
  }
);

test.serial('copilot attachments require canonical session scope', async t => {
  const mutableEnv = globalThis.env as unknown as { NODE_ENV: string };
  const previous = mutableEnv.NODE_ENV;
  mutableEnv.NODE_ENV = 'production';
  t.teardown(() => {
    mutableEnv.NODE_ENV = previous;
  });

  const attachmentObjects = new Map<
    string,
    { body: Buffer; contentType: string }
  >();
  const attachmentWrites: string[] = [];
  const attachmentReads: string[] = [];
  const attachmentStorage = new CopilotStorage({
    putObject: async (
      _scope: string,
      key: string,
      body: Buffer,
      metadata: { contentType: string }
    ) => {
      attachmentWrites.push(key);
      attachmentObjects.set(key, {
        body,
        contentType: metadata.contentType,
      });
    },
    getObject: async (_scope: string, key: string) => {
      attachmentReads.push(key);
      const object = attachmentObjects.get(key);
      return object
        ? {
            body: Readable.from(object.body),
            metadata: {
              contentType: object.contentType,
              contentLength: object.body.length,
            },
          }
        : {};
    },
  } as never);
  const accessTrace: string[] = [];
  let attachmentMode: 'canonical' | 'personal' = 'canonical';
  const attachmentSessions = {
    getOwnedScope: async (sessionId: string, userId: string) => {
      accessTrace.push(`scope:${userId}:${sessionId}`);
      return {
        workspaceId: 'workspace-1',
        docId: 'doc-1',
      };
    },
    getInScope: async (input: { workspaceId: string }) => {
      accessTrace.push(`session:${input.workspaceId}`);
      return {};
    },
  } as never;
  const attachmentAccess = {
    sessionResource: async () => {
      accessTrace.push(`acl:${attachmentMode}`);
      return attachmentMode;
    },
  } as never;
  const attachmentController = new CopilotAttachmentController(
    attachmentSessions,
    attachmentAccess,
    attachmentStorage
  );
  const attachmentBody = Buffer.from('typed attachment');
  const attachmentKey = createHash('sha256')
    .update(attachmentBody)
    .digest('base64url');
  const uploaded = await attachmentController.upload(
    { id: 'user-1' } as never,
    'session-1',
    attachmentKey,
    'workspace-1',
    'text/plain',
    'notes.txt',
    { rawBody: attachmentBody } as never
  );
  for (const attachment of [
    uploaded.url,
    { attachment: uploaded.url, mimeType: 'text/plain' },
    { kind: 'url', url: uploaded.url, mimeType: 'text/plain' },
  ]) {
    t.true(ChatMessageAttachment.safeParse(attachment).success);
  }
  for (const url of ['/private/file.txt', '//example.com/file.txt']) {
    t.false(ChatMessageAttachment.safeParse(url).success);
  }
  const admitted = await new AttachmentAdmissionHost(
    {
      fetchRemoteAttachment: async () =>
        t.fail('typed attachment reached remote fetch'),
    } as never,
    attachmentStorage
  ).admitPromptAttachment(uploaded.url, {
    userId: 'user-1',
    workspaceId: 'workspace-1',
    sessionId: 'session-1',
    assertCanUseAttachment: async () => {
      accessTrace.push('admission-acl');
    },
  });
  const responseBody: Buffer[] = [];
  const responseHeaders: Record<string, string> = {};
  const responseStream = new PassThrough();
  responseStream.on('data', chunk => responseBody.push(Buffer.from(chunk)));
  const response = Object.assign(responseStream, {
    setHeader: (name: string, value: string | number) => {
      responseHeaders[name.toLowerCase()] = String(value);
      return responseStream;
    },
    getHeader: (name: string) => responseHeaders[name.toLowerCase()],
  }) as unknown as Response;
  await attachmentController.download(
    { id: 'user-1' } as never,
    'session-1',
    attachmentKey,
    'workspace-1',
    'notes.txt',
    response
  );
  attachmentMode = 'personal';
  const personalUpload = await t.throwsAsync(
    attachmentController.upload(
      { id: 'user-1' } as never,
      'session-1',
      attachmentKey,
      'workspace-1',
      'text/plain',
      'notes.txt',
      { rawBody: attachmentBody } as never
    )
  );
  const personalRead = await t.throwsAsync(
    attachmentController.download(
      { id: 'user-1' } as never,
      'session-1',
      attachmentKey,
      'workspace-1',
      'notes.txt',
      response
    )
  );
  const crossSession = await t.throwsAsync(
    new AttachmentAdmissionHost(
      {} as never,
      attachmentStorage
    ).admitPromptAttachment(uploaded.url, {
      userId: 'user-1',
      workspaceId: 'workspace-1',
      sessionId: 'session-2',
    })
  );
  await t.throwsAsync(
    new AttachmentAdmissionHost(
      {} as never,
      attachmentStorage
    ).admitPromptAttachment(uploaded.url, {
      userId: 'user-1',
      workspaceId: 'workspace-2',
      sessionId: 'session-1',
    }),
    { message: 'Copilot attachment scope mismatch' }
  );

  t.snapshot({
    uploaded,
    admitted,
    response: {
      body: Buffer.concat(responseBody).toString(),
      headers: responseHeaders,
    },
    failures: {
      upload: personalUpload?.message,
      read: personalRead?.message,
      crossSession: crossSession?.message,
    },
    attachmentWrites,
    attachmentReads,
    accessTrace,
  });
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
    actions
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
