import test from 'ava';
import { z } from 'zod';

import { NativeLlmRequest, NativeLlmStreamEvent } from '../../native';
import {
  ToolCallAccumulator,
  ToolCallLoop,
  ToolSchemaExtractor,
} from '../../plugins/copilot/providers/loop';

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
