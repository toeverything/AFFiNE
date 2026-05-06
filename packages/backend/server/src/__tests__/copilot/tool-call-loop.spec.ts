import serverNativeModule from '@affine/server-native';
import test from 'ava';
import { z } from 'zod';

import type { DocReader } from '../../core/doc';
import type { AccessController } from '../../core/permission';
import type { Models } from '../../models';
import {
  LlmRequest,
  type LlmToolCallbackRequest,
  type LlmToolCallbackResponse,
  type LlmToolLoopStreamEvent,
  llmValidateContract,
} from '../../native';
import {
  buildToolContracts,
  parseToolContract,
  parseToolLoopStreamEvent,
} from '../../plugins/copilot/runtime/contracts';
import {
  createToolExecutionCallback,
  createToolLoopBridge,
} from '../../plugins/copilot/runtime/tool/bridge';
import {
  buildBlobContentGetter,
  createBlobReadTool,
} from '../../plugins/copilot/tools/blob-read';
import {
  buildDocKeywordSearchGetter,
  createDocKeywordSearchTool,
} from '../../plugins/copilot/tools/doc-keyword-search';
import {
  buildDocContentGetter,
  createDocReadTool,
} from '../../plugins/copilot/tools/doc-read';
import {
  buildDocSearchGetter,
  createDocSemanticSearchTool,
} from '../../plugins/copilot/tools/doc-semantic-search';
import {
  DOCUMENT_SYNC_PENDING_MESSAGE,
  LOCAL_WORKSPACE_SYNC_REQUIRED_MESSAGE,
} from '../../plugins/copilot/tools/doc-sync';
import { defineTool } from '../../plugins/copilot/tools/tool';
import {
  nativeMessages,
  nativeUserText,
  singleUserPromptMessages,
} from './prompt-test-helper';

test('defineTool should freeze json schema at definition time', t => {
  const tool = defineTool({
    description: 'Read doc',
    inputSchema: z.object({
      doc_id: z.string(),
      limit: z.number().optional(),
    }),
    execute: async () => ({}),
  });

  t.deepEqual(tool.jsonSchema, {
    type: 'object',
    properties: {
      doc_id: { type: 'string' },
      limit: { type: 'number' },
    },
    additionalProperties: false,
    required: ['doc_id'],
  });
});

test('buildToolContracts should project precomputed json schema', t => {
  const toolSet = {
    doc_read: defineTool({
      description: 'Read doc',
      inputSchema: z.object({
        doc_id: z.string(),
        limit: z.number().optional(),
      }),
      execute: async () => ({}),
    }),
  };

  const extracted = buildToolContracts(toolSet);

  t.deepEqual(extracted, [
    {
      name: 'doc_read',
      description: 'Read doc',
      parameters: {
        type: 'object',
        properties: {
          doc_id: { type: 'string' },
          limit: { type: 'number' },
        },
        additionalProperties: false,
        required: ['doc_id'],
      },
    },
  ]);
});

test('buildToolContracts should reject tool definitions without json schema', t => {
  const error = t.throws(() =>
    buildToolContracts({
      doc_read: {
        description: 'Read doc',
        inputSchema: z.object({ doc_id: z.string() }),
        execute: async () => ({}),
      } as never,
    })
  );

  t.regex(error.message, /missing precomputed jsonSchema/);
});

test('defineTool should prefer explicit json schema when provided', t => {
  const extracted = buildToolContracts({
    doc_read: defineTool({
      description: 'Read doc',
      jsonSchema: {
        type: 'object',
        properties: {
          doc_id: { type: 'string' },
        },
        required: ['doc_id'],
      },
      inputSchema: z.object({
        doc_id: z.string(),
        ignored: z.number(),
      }),
      execute: async () => ({}),
    }),
  });

  t.deepEqual(extracted, [
    {
      name: 'doc_read',
      description: 'Read doc',
      parameters: {
        type: 'object',
        properties: {
          doc_id: { type: 'string' },
        },
        required: ['doc_id'],
      },
    },
  ]);
});

test('ToolContract should freeze stable tool schema and callback payloads', t => {
  const tool = parseToolContract({
    name: 'doc_read',
    description: 'Read doc',
    parameters: {
      type: 'object',
      properties: {
        doc_id: { type: 'string' },
      },
      required: ['doc_id'],
    },
  });
  const result = llmValidateContract<LlmToolCallbackResponse>(
    'toolCallbackResponse',
    {
      callId: 'call_1',
      name: 'doc_read',
      args: { doc_id: 'a1' },
      output: { markdown: '# a1' },
    }
  );
  const request = llmValidateContract<LlmToolCallbackRequest>(
    'toolCallbackRequest',
    {
      callId: 'call_1',
      name: 'doc_read',
      args: { doc_id: 'a1' },
    }
  );

  t.is(tool.name, 'doc_read');
  t.deepEqual(request.args, { doc_id: 'a1' });
  t.deepEqual(result.args, { doc_id: 'a1' });
});

test('ToolLoopStreamEvent should reject malformed tool_result metadata at decode boundary', t => {
  const event = parseToolLoopStreamEvent({
    type: 'tool_result',
    call_id: 'call_1',
    name: 'doc_read',
    arguments: { doc_id: 'a1' },
    output: { markdown: '# a1' },
  });

  t.is(event.type, 'tool_result');

  const error = t.throws(() =>
    parseToolLoopStreamEvent({
      type: 'tool_result',
      call_id: 'call_1',
      output: { markdown: '# a1' },
    })
  );

  t.truthy(error);
});

test('createNativeToolExecutionCallback should preserve tool execution ABI', async t => {
  const callback = createToolExecutionCallback(
    {
      doc_read: {
        inputSchema: z.object({ doc_id: z.string() }),
        execute: async args => ({ markdown: `# ${String(args.doc_id)}` }),
      },
    },
    { messages: singleUserPromptMessages('read doc') }
  );

  const result = await callback({
    callId: 'call_1',
    name: 'doc_read',
    args: { doc_id: 'a1' },
    rawArgumentsText: '{"doc_id":"a1"}',
  });

  t.deepEqual(result, {
    callId: 'call_1',
    name: 'doc_read',
    args: { doc_id: 'a1' },
    rawArgumentsText: '{"doc_id":"a1"}',
    argumentParseError: undefined,
    output: { markdown: '# a1' },
  });
});

test('createNativeToolLoopBridge should preserve native callback and stream ABI', async t => {
  const capturedRequests: LlmRequest[] = [];
  const originalMessages = singleUserPromptMessages('read doc');
  const signal = new AbortController().signal;
  let executedArgs: Record<string, unknown> | null = null;
  let executedMessages: unknown;
  let executedSignal: AbortSignal | undefined;

  const original = (serverNativeModule as any).llmDispatchToolLoopStream;
  (serverNativeModule as any).llmDispatchToolLoopStream = (
    _protocol: string,
    _backendConfigJson: string,
    requestJson: string,
    maxSteps: number,
    callback: (error: Error | null, eventJson: string) => void,
    toolCallback: (error: Error | null, requestJson: string) => Promise<string>
  ) => {
    capturedRequests.push(JSON.parse(requestJson) as LlmRequest);
    t.is(maxSteps, 4);

    void (async () => {
      callback(
        null,
        JSON.stringify({
          type: 'tool_call',
          call_id: 'call_1',
          name: 'doc_read',
          arguments: { doc_id: 'a1' },
        })
      );

      const result = JSON.parse(
        await toolCallback(
          null,
          JSON.stringify({
            callId: 'call_1',
            name: 'doc_read',
            args: { doc_id: 'a1' },
            rawArgumentsText: '{"doc_id":"a1"}',
          })
        )
      ) as {
        callId: string;
        name: string;
        args: Record<string, unknown>;
        rawArgumentsText?: string;
        argumentParseError?: string;
        output: unknown;
        isError?: boolean;
      };

      callback(
        null,
        JSON.stringify({
          type: 'tool_result',
          call_id: result.callId,
          name: result.name,
          arguments: result.args,
          arguments_text: result.rawArgumentsText,
          arguments_error: result.argumentParseError,
          output: result.output,
          is_error: result.isError,
        })
      );
      callback(null, JSON.stringify({ type: 'text_delta', text: 'done' }));
      callback(null, JSON.stringify({ type: 'done', finish_reason: 'stop' }));
      callback(null, '__AFFINE_LLM_STREAM_END__');
    })();

    return {
      abort() {},
    };
  };
  t.teardown(() => {
    (serverNativeModule as any).llmDispatchToolLoopStream = original;
  });

  const bridge = createToolLoopBridge(
    {
      protocol: 'openai_chat',
      backendConfig: {
        base_url: 'https://api.openai.com',
        auth_token: 'test-key',
      },
    },
    {
      doc_read: {
        inputSchema: z.object({ doc_id: z.string() }),
        execute: async (args, options) => {
          executedArgs = args;
          executedMessages = options.messages;
          executedSignal = options.signal;
          return { markdown: '# doc' };
        },
      },
    },
    4
  );

  const events: LlmToolLoopStreamEvent[] = [];
  for await (const event of bridge(
    {
      model: 'gpt-5-mini',
      stream: false,
      messages: nativeMessages(nativeUserText('read doc')),
    },
    signal,
    [...originalMessages]
  )) {
    events.push(event);
  }

  t.deepEqual(executedArgs, { doc_id: 'a1' });
  t.deepEqual(executedMessages, originalMessages);
  t.is(executedSignal, signal);
  t.true(capturedRequests[0]?.stream);
  t.deepEqual(
    events.map(event => event.type),
    ['tool_call', 'tool_result', 'text_delta', 'done']
  );
});

test('doc_read should return specific sync errors for unavailable docs', async t => {
  const cases = [
    {
      name: 'local workspace without cloud sync',
      workspace: null,
      authors: null,
      markdown: null,
      expected: {
        type: 'error',
        name: 'Workspace Sync Required',
        message: LOCAL_WORKSPACE_SYNC_REQUIRED_MESSAGE,
      },
      docReaderCalled: false,
    },
    {
      name: 'cloud workspace document not synced to server yet',
      workspace: { id: 'ws-1' },
      authors: null,
      markdown: null,
      expected: {
        type: 'error',
        name: 'Document Sync Pending',
        message: DOCUMENT_SYNC_PENDING_MESSAGE('doc-1'),
      },
      docReaderCalled: false,
    },
    {
      name: 'cloud workspace document markdown not ready yet',
      workspace: { id: 'ws-1' },
      authors: {
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        createdByUser: null,
        updatedByUser: null,
      },
      markdown: null,
      expected: {
        type: 'error',
        name: 'Document Sync Pending',
        message: DOCUMENT_SYNC_PENDING_MESSAGE('doc-1'),
      },
      docReaderCalled: true,
    },
  ] as const;

  const ac = {
    user: () => ({
      workspace: () => ({ doc: () => ({ can: async () => true }) }),
    }),
  } as unknown as AccessController;

  for (const testCase of cases) {
    let docReaderCalled = false;
    const docReader = {
      getDocMarkdown: async () => {
        docReaderCalled = true;
        return testCase.markdown;
      },
    } as unknown as DocReader;

    const models = {
      workspace: {
        get: async () => testCase.workspace,
      },
      doc: {
        getAuthors: async () => testCase.authors,
      },
    } as unknown as Models;

    const getDoc = buildDocContentGetter(ac, docReader, models);
    const tool = createDocReadTool(
      getDoc.bind(null, {
        user: 'user-1',
        workspace: 'workspace-1',
      })
    );

    const result = await tool.execute?.({ doc_id: 'doc-1' }, {});

    t.is(docReaderCalled, testCase.docReaderCalled, testCase.name);
    t.deepEqual(result, testCase.expected, testCase.name);
  }
});

test('document search tools should return sync error for local workspace', async t => {
  const ac = {
    user: () => ({
      workspace: () => ({
        can: async () => true,
        docs: async () => [],
      }),
    }),
  } as unknown as AccessController;

  const models = {
    workspace: {
      get: async () => null,
    },
  } as unknown as Models;

  let keywordSearchCalled = false;
  const indexerService = {
    searchDocsByKeyword: async () => {
      keywordSearchCalled = true;
      return [];
    },
  } as unknown as Parameters<typeof buildDocKeywordSearchGetter>[1];

  let semanticSearchCalled = false;
  const contextService = {
    matchWorkspaceAll: async () => {
      semanticSearchCalled = true;
      return [];
    },
  } as unknown as Parameters<typeof buildDocSearchGetter>[1];

  const keywordTool = createDocKeywordSearchTool(
    buildDocKeywordSearchGetter(ac, indexerService, models).bind(null, {
      user: 'user-1',
      workspace: 'workspace-1',
    })
  );

  const semanticTool = createDocSemanticSearchTool(
    buildDocSearchGetter(ac, contextService, undefined, models).bind(null, {
      user: 'user-1',
      workspace: 'workspace-1',
    })
  );

  const keywordResult = await keywordTool.execute?.({ query: 'hello' }, {});
  const semanticResult = await semanticTool.execute?.({ query: 'hello' }, {});

  t.false(keywordSearchCalled);
  t.false(semanticSearchCalled);
  t.deepEqual(keywordResult, {
    type: 'error',
    name: 'Workspace Sync Required',
    message: LOCAL_WORKSPACE_SYNC_REQUIRED_MESSAGE,
  });
  t.deepEqual(semanticResult, {
    type: 'error',
    name: 'Workspace Sync Required',
    message: LOCAL_WORKSPACE_SYNC_REQUIRED_MESSAGE,
  });
});

test('doc_semantic_search should return empty array when nothing matches', async t => {
  const ac = {
    user: () => ({
      workspace: () => ({
        can: async () => true,
        docs: async () => [],
      }),
    }),
  } as unknown as AccessController;

  const models = {
    workspace: {
      get: async () => ({ id: 'workspace-1' }),
    },
  } as unknown as Models;

  const contextService = {
    matchWorkspaceAll: async () => [],
  } as unknown as Parameters<typeof buildDocSearchGetter>[1];

  const semanticTool = createDocSemanticSearchTool(
    buildDocSearchGetter(ac, contextService, undefined, models).bind(null, {
      user: 'user-1',
      workspace: 'workspace-1',
    })
  );

  const result = await semanticTool.execute?.({ query: 'hello' }, {});

  t.deepEqual(result, []);
});

test('doc_semantic_search should pass BYOK route context into embedding matches', async t => {
  const ac = {
    user: () => ({
      workspace: () => ({
        can: async () => true,
        docs: async () => [],
      }),
    }),
  } as unknown as AccessController;

  const models = {
    workspace: {
      get: async () => ({ id: 'workspace-1' }),
    },
  } as unknown as Models;

  let workspaceRouteContext: unknown;
  let sessionRouteContext: unknown;
  const contextService = {
    matchWorkspaceAll: async (...args: unknown[]) => {
      workspaceRouteContext = args[7];
      return [];
    },
    getBySessionId: async () => ({
      matchFiles: async (...args: unknown[]) => {
        sessionRouteContext = args[5];
        return [];
      },
    }),
  } as unknown as Parameters<typeof buildDocSearchGetter>[1];

  const semanticTool = createDocSemanticSearchTool(
    buildDocSearchGetter(ac, contextService, 'session-1', models).bind(null, {
      user: 'user-1',
      workspace: 'workspace-1',
      byokLeaseId: 'lease-1',
    })
  );

  const result = await semanticTool.execute?.({ query: 'hello' }, {});

  t.deepEqual(result, []);
  t.deepEqual(workspaceRouteContext, {
    userId: 'user-1',
    byokLeaseId: 'lease-1',
  });
  t.deepEqual(sessionRouteContext, {
    userId: 'user-1',
    byokLeaseId: 'lease-1',
  });
});

test('blob_read should return explicit error when attachment context is missing', async t => {
  const ac = {
    user: () => ({
      workspace: () => ({
        allowLocal: () => ({
          can: async () => true,
        }),
      }),
    }),
  } as unknown as AccessController;

  const blobTool = createBlobReadTool(
    buildBlobContentGetter(ac, null).bind(null, {
      user: 'user-1',
      workspace: 'workspace-1',
    })
  );

  const result = await blobTool.execute?.({ blob_id: 'blob-1' }, {});

  t.deepEqual(result, {
    type: 'error',
    name: 'Blob Read Failed',
    message:
      'Missing workspace, user, blob id, or copilot context for blob_read.',
  });
});
