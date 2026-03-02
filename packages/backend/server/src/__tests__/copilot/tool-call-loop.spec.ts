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
  const loop = new ToolCallLoop(
    dispatch,
    {
      doc_read: {
        inputSchema: z.object({ doc_id: z.string() }),
        execute: async args => {
          executedArgs = args;
          return { markdown: '# doc' };
        },
      },
    },
    4
  );

  const events: NativeLlmStreamEvent[] = [];
  for await (const event of loop.run({
    model: 'gpt-4.1',
    stream: true,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'read doc' }] }],
  })) {
    events.push(event);
  }

  t.deepEqual(executedArgs, { doc_id: 'a1' });
  t.true(
    dispatchRequests[1]?.messages.some(message => message.role === 'tool')
  );
  t.deepEqual(
    events.map(event => event.type),
    ['tool_call', 'tool_result', 'text_delta', 'done']
  );
});
