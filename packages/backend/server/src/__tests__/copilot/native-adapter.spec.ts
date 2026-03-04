import test from 'ava';
import { z } from 'zod';

import type { NativeLlmRequest, NativeLlmStreamEvent } from '../../native';
import {
  buildNativeRequest,
  NativeProviderAdapter,
} from '../../plugins/copilot/providers/native';

const mockDispatch = () =>
  (async function* (): AsyncIterableIterator<NativeLlmStreamEvent> {
    yield { type: 'text_delta', text: 'Use [^1] now' };
    yield { type: 'citation', index: 1, url: 'https://affine.pro' };
    yield { type: 'done', finish_reason: 'stop' };
  })();

test('NativeProviderAdapter streamText should append citation footnotes', async t => {
  const adapter = new NativeProviderAdapter(mockDispatch, {}, 3);
  const chunks: string[] = [];
  for await (const chunk of adapter.streamText({
    model: 'gpt-4.1',
    stream: true,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  })) {
    chunks.push(chunk);
  }

  const text = chunks.join('');
  t.true(text.includes('Use [^1] now'));
  t.true(
    text.includes('[^1]: {"type":"url","url":"https%3A%2F%2Faffine.pro"}')
  );
});

test('NativeProviderAdapter streamObject should append citation footnotes', async t => {
  const adapter = new NativeProviderAdapter(mockDispatch, {}, 3);
  const chunks = [];
  for await (const chunk of adapter.streamObject({
    model: 'gpt-4.1',
    stream: true,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  })) {
    chunks.push(chunk);
  }

  t.deepEqual(
    chunks.map(chunk => chunk.type),
    ['text-delta', 'text-delta']
  );
  const text = chunks
    .filter(chunk => chunk.type === 'text-delta')
    .map(chunk => chunk.textDelta)
    .join('');
  t.true(text.includes('Use [^1] now'));
  t.true(
    text.includes('[^1]: {"type":"url","url":"https%3A%2F%2Faffine.pro"}')
  );
});

test('NativeProviderAdapter streamObject should append fallback attachment footnotes', async t => {
  const dispatch = () =>
    (async function* (): AsyncIterableIterator<NativeLlmStreamEvent> {
      yield {
        type: 'tool_result',
        call_id: 'call_1',
        name: 'blob_read',
        arguments: { blob_id: 'blob_1' },
        output: {
          blobId: 'blob_1',
          fileName: 'a.txt',
          fileType: 'text/plain',
          content: 'A',
        },
      };
      yield {
        type: 'tool_result',
        call_id: 'call_2',
        name: 'blob_read',
        arguments: { blob_id: 'blob_2' },
        output: {
          blobId: 'blob_2',
          fileName: 'b.txt',
          fileType: 'text/plain',
          content: 'B',
        },
      };
      yield { type: 'text_delta', text: 'Answer from files.' };
      yield { type: 'done', finish_reason: 'stop' };
    })();

  const adapter = new NativeProviderAdapter(dispatch, {}, 3);
  const chunks = [];
  for await (const chunk of adapter.streamObject({
    model: 'gpt-4.1',
    stream: true,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  })) {
    chunks.push(chunk);
  }

  const text = chunks
    .filter(chunk => chunk.type === 'text-delta')
    .map(chunk => chunk.textDelta)
    .join('');
  t.true(text.includes('Answer from files.'));
  t.true(text.includes('[^1][^2]'));
  t.true(
    text.includes(
      '[^1]: {"type":"attachment","blobId":"blob_1","fileName":"a.txt","fileType":"text/plain"}'
    )
  );
  t.true(
    text.includes(
      '[^2]: {"type":"attachment","blobId":"blob_2","fileName":"b.txt","fileType":"text/plain"}'
    )
  );
});

test('NativeProviderAdapter streamObject should map tool and text events', async t => {
  let round = 0;
  const dispatch = (_request: NativeLlmRequest) =>
    (async function* (): AsyncIterableIterator<NativeLlmStreamEvent> {
      round += 1;
      if (round === 1) {
        yield {
          type: 'tool_call',
          call_id: 'call_1',
          name: 'doc_read',
          arguments: { doc_id: 'a1' },
        };
        yield { type: 'done', finish_reason: 'tool_calls' };
        return;
      }
      yield { type: 'text_delta', text: 'ok' };
      yield { type: 'done', finish_reason: 'stop' };
    })();

  const adapter = new NativeProviderAdapter(
    dispatch,
    {
      doc_read: {
        inputSchema: z.object({ doc_id: z.string() }),
        execute: async () => ({ markdown: '# a1' }),
      },
    },
    4
  );

  const events = [];
  for await (const event of adapter.streamObject({
    model: 'gpt-4.1',
    stream: true,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'read' }] }],
  })) {
    events.push(event);
  }

  t.deepEqual(
    events.map(event => event.type),
    ['tool-call', 'tool-result', 'text-delta']
  );
  t.deepEqual(events[0], {
    type: 'tool-call',
    toolCallId: 'call_1',
    toolName: 'doc_read',
    args: { doc_id: 'a1' },
  });
});

test('buildNativeRequest should include rust middleware from profile', async t => {
  const { request } = await buildNativeRequest({
    model: 'gpt-4.1',
    messages: [{ role: 'user', content: 'hello' }],
    tools: {},
    middleware: {
      rust: {
        request: ['normalize_messages', 'clamp_max_tokens'],
        stream: ['stream_event_normalize', 'citation_indexing'],
      },
      node: {
        text: ['callout'],
      },
    },
  });

  t.deepEqual(request.middleware, {
    request: ['normalize_messages', 'clamp_max_tokens'],
    stream: ['stream_event_normalize', 'citation_indexing'],
  });
});

test('NativeProviderAdapter streamText should skip citation footnotes when disabled', async t => {
  const adapter = new NativeProviderAdapter(mockDispatch, {}, 3, {
    nodeTextMiddleware: ['callout'],
  });
  const chunks: string[] = [];
  for await (const chunk of adapter.streamText({
    model: 'gpt-4.1',
    stream: true,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  })) {
    chunks.push(chunk);
  }

  const text = chunks.join('');
  t.true(text.includes('Use [^1] now'));
  t.false(
    text.includes('[^1]: {"type":"url","url":"https%3A%2F%2Faffine.pro"}')
  );
});
