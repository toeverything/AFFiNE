import test from 'ava';
import { z } from 'zod';

import type { DocReader } from '../../core/doc';
import type { AccessController } from '../../core/permission';
import type { Models } from '../../models';
import { NativeLlmRequest, NativeLlmStreamEvent } from '../../native';
import {
  ToolCallAccumulator,
  ToolCallLoop,
  ToolSchemaExtractor,
} from '../../plugins/copilot/providers/loop';
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

test('ToolCallAccumulator should merge deltas and complete tool call', t => {
  const accumulator = new ToolCallAccumulator();

  accumulator.feedDelta({
    type: 'tool_call_delta',
    call_id: 'call_1',
    name: 'doc_read',
    arguments_delta: '{"doc_id":"',
  });
  accumulator.feedDelta({
    type: 'tool_call_delta',
    call_id: 'call_1',
    arguments_delta: 'a1"}',
  });

  const completed = accumulator.complete({
    type: 'tool_call',
    call_id: 'call_1',
    name: 'doc_read',
    arguments: { doc_id: 'a1' },
  });

  t.deepEqual(completed, {
    id: 'call_1',
    name: 'doc_read',
    args: { doc_id: 'a1' },
    rawArgumentsText: '{"doc_id":"a1"}',
    thought: undefined,
  });
});

test('ToolCallAccumulator should preserve invalid JSON instead of swallowing it', t => {
  const accumulator = new ToolCallAccumulator();

  accumulator.feedDelta({
    type: 'tool_call_delta',
    call_id: 'call_1',
    name: 'doc_read',
    arguments_delta: '{"doc_id":',
  });

  const pending = accumulator.drainPending();

  t.is(pending.length, 1);
  t.deepEqual(pending[0]?.id, 'call_1');
  t.deepEqual(pending[0]?.name, 'doc_read');
  t.deepEqual(pending[0]?.args, {});
  t.is(pending[0]?.rawArgumentsText, '{"doc_id":');
  t.truthy(pending[0]?.argumentParseError);
});

test('ToolCallAccumulator should prefer native canonical tool arguments metadata', t => {
  const accumulator = new ToolCallAccumulator();

  accumulator.feedDelta({
    type: 'tool_call_delta',
    call_id: 'call_1',
    name: 'doc_read',
    arguments_delta: '{"stale":true}',
  });

  const completed = accumulator.complete({
    type: 'tool_call',
    call_id: 'call_1',
    name: 'doc_read',
    arguments: {},
    arguments_text: '{"doc_id":"a1"}',
    arguments_error: 'invalid json',
  });

  t.deepEqual(completed, {
    id: 'call_1',
    name: 'doc_read',
    args: {},
    rawArgumentsText: '{"doc_id":"a1"}',
    argumentParseError: 'invalid json',
    thought: undefined,
  });
});

test('ToolSchemaExtractor should convert zod schema to json schema', t => {
  const toolSet = {
    doc_read: {
      description: 'Read doc',
      inputSchema: z.object({
        doc_id: z.string(),
        limit: z.number().optional(),
      }),
      execute: async () => ({}),
    },
  };

  const extracted = ToolSchemaExtractor.extract(toolSet);

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

test('ToolCallLoop should execute tool call and continue to next round', async t => {
  const dispatchRequests: NativeLlmRequest[] = [];
  const originalMessages = [{ role: 'user', content: 'read doc' }] as const;
  const signal = new AbortController().signal;

  const dispatch = (request: NativeLlmRequest) => {
    dispatchRequests.push(request);
    const round = dispatchRequests.length;

    return (async function* (): AsyncIterableIterator<NativeLlmStreamEvent> {
      if (round === 1) {
        yield {
          type: 'tool_call_delta',
          call_id: 'call_1',
          name: 'doc_read',
          arguments_delta: '{"doc_id":"a1"}',
        };
        yield {
          type: 'tool_call',
          call_id: 'call_1',
          name: 'doc_read',
          arguments: { doc_id: 'a1' },
        };
        yield { type: 'done', finish_reason: 'tool_calls' };
        return;
      }

      yield { type: 'text_delta', text: 'done' };
      yield { type: 'done', finish_reason: 'stop' };
    })();
  };

  let executedArgs: Record<string, unknown> | null = null;
  let executedMessages: unknown;
  let executedSignal: AbortSignal | undefined;
  const loop = new ToolCallLoop(
    dispatch,
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

  const events: NativeLlmStreamEvent[] = [];
  for await (const event of loop.run(
    {
      model: 'gpt-5-mini',
      stream: true,
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'read doc' }] },
      ],
    },
    signal,
    [...originalMessages]
  )) {
    events.push(event);
  }

  t.deepEqual(executedArgs, { doc_id: 'a1' });
  t.deepEqual(executedMessages, originalMessages);
  t.is(executedSignal, signal);
  t.true(
    dispatchRequests[1]?.messages.some(message => message.role === 'tool')
  );
  t.deepEqual(dispatchRequests[1]?.messages[1]?.content, [
    {
      type: 'tool_call',
      call_id: 'call_1',
      name: 'doc_read',
      arguments: { doc_id: 'a1' },
      arguments_text: '{"doc_id":"a1"}',
      arguments_error: undefined,
      thought: undefined,
    },
  ]);
  t.deepEqual(dispatchRequests[1]?.messages[2]?.content, [
    {
      type: 'tool_result',
      call_id: 'call_1',
      name: 'doc_read',
      arguments: { doc_id: 'a1' },
      arguments_text: '{"doc_id":"a1"}',
      arguments_error: undefined,
      output: { markdown: '# doc' },
      is_error: undefined,
    },
  ]);
  t.deepEqual(
    events.map(event => event.type),
    ['tool_call', 'tool_result', 'text_delta', 'done']
  );
});

test('ToolCallLoop should surface invalid JSON as tool error without executing', async t => {
  let executed = false;
  let round = 0;
  const loop = new ToolCallLoop(
    request => {
      round += 1;
      const hasToolResult = request.messages.some(
        message => message.role === 'tool'
      );
      return (async function* (): AsyncIterableIterator<NativeLlmStreamEvent> {
        if (!hasToolResult && round === 1) {
          yield {
            type: 'tool_call_delta',
            call_id: 'call_1',
            name: 'doc_read',
            arguments_delta: '{"doc_id":',
          };
          yield { type: 'done', finish_reason: 'tool_calls' };
          return;
        }

        yield { type: 'done', finish_reason: 'stop' };
      })();
    },
    {
      doc_read: {
        inputSchema: z.object({ doc_id: z.string() }),
        execute: async () => {
          executed = true;
          return { markdown: '# doc' };
        },
      },
    },
    2
  );

  const events: NativeLlmStreamEvent[] = [];
  for await (const event of loop.run({
    model: 'gpt-5-mini',
    stream: true,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'read doc' }] }],
  })) {
    events.push(event);
  }

  t.false(executed);
  t.true(events[0]?.type === 'tool_result');
  t.deepEqual(events[0], {
    type: 'tool_result',
    call_id: 'call_1',
    name: 'doc_read',
    arguments: {},
    arguments_text: '{"doc_id":',
    arguments_error:
      events[0]?.type === 'tool_result' ? events[0].arguments_error : undefined,
    output: {
      message: 'Invalid tool arguments JSON',
      rawArguments: '{"doc_id":',
      error:
        events[0]?.type === 'tool_result'
          ? events[0].arguments_error
          : undefined,
    },
    is_error: true,
  });
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
    buildDocSearchGetter(ac, contextService, null, models).bind(null, {
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
    buildDocSearchGetter(ac, contextService, null, models).bind(null, {
      user: 'user-1',
      workspace: 'workspace-1',
    })
  );

  const result = await semanticTool.execute?.({ query: 'hello' }, {});

  t.deepEqual(result, []);
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
