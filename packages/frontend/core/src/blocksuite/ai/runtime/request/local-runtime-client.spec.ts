/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { RequestTimeoutError } from '../../provider/error';
import { streamDesktopLocalChat } from './local-runtime-client';

const readyStatus = {
  state: 'ready',
  canRun: true,
  fallbackToServer: false,
  endpoint: 'http://127.0.0.1:43111',
  port: 43111,
  pid: 222,
  modelId: 'gemma-3-4b-it-local',
} as const;

const electronApis = vi.hoisted(() => ({
  localAI: {
    ensureReady: vi.fn(),
  },
}));

const fetchMock = vi.fn();

vi.mock('@affine/electron-api', () => ({
  apis: electronApis,
}));

async function collect(stream: AsyncIterable<string>) {
  const chunks: string[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

function jsonCompletion(content: string) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
    }),
    { headers: { 'content-type': 'application/json' } }
  );
}

describe('streamDesktopLocalChat', () => {
  beforeEach(() => {
    electronApis.localAI.ensureReady.mockReset();
    electronApis.localAI.ensureReady.mockResolvedValue(readyStatus);
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(
      new Response(
        [
          'data: {"choices":[{"delta":{"content":"hello"}}]}',
          '',
          'data: {"choices":[{"delta":{"content":" world"}}]}',
          '',
          'data: [DONE]',
          '',
        ].join('\n')
      )
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('yields streamed local AI text chunks', async () => {
    const result = await collect(
      await streamDesktopLocalChat({
        client: {} as never,
        sessionId: 'session-1',
        content: 'Hello local AI',
        params: {},
        stream: true,
      })
    );

    expect(result).toEqual(['hello', ' world']);
  });

  test('preserves the final SSE chunk without a trailing newline', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('data: {"choices":[{"delta":{"content":"tail"}}]}')
    );

    const result = await collect(
      await streamDesktopLocalChat({
        client: {} as never,
        sessionId: 'session-2',
        content: 'Tail chunk',
        params: {},
        stream: true,
      })
    );

    expect(result).toEqual(['tail']);
  });

  test('includes the user prompt text in the posted local request body', async () => {
    fetchMock.mockResolvedValueOnce(new Response('data: [DONE]\n\n'));

    await collect(
      await streamDesktopLocalChat({
        client: {} as never,
        sessionId: 'session-2b',
        content: 'Hello local AI',
        params: {},
        stream: true,
      })
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const userContent = body.messages[1]?.content as Array<{
      type: string;
      text?: string;
    }>;

    expect(userContent).toContainEqual({
      type: 'text',
      text: 'Hello local AI',
    });
  });

  test('injects action-specific instructions for local translate actions', async () => {
    fetchMock.mockResolvedValueOnce(new Response('data: [DONE]\n\n'));

    await collect(
      await streamDesktopLocalChat({
        client: {} as never,
        sessionId: 'session-2translate',
        content: 'Bonjour tout le monde',
        promptName: 'Translate to',
        params: { language: 'English' },
        stream: true,
      })
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const userContent = body.messages[1]?.content as Array<{
      type: string;
      text?: string;
    }>;

    expect(userContent[0]).toEqual(
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining(
          'Task: Translate the source text into English.'
        ),
      })
    );
    expect(userContent[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining('Source text:\nBonjour tout le monde'),
      })
    );
  });

  test('uses the expanded paragraph profile for longer local mindmap actions', async () => {
    const source = [
      'Plan the AFFiNE local AI desktop release.',
      'Cover packaging, runtime validation, performance checks, rollback plans, release communication, and post-release monitoring.',
      'Include risks, owners, checkpoints, and verification steps for each area.',
      'Break the work into packaging, startup validation, model routing, error handling, QA, release operations, support readiness, and post-release follow-up.',
      'For each area, include concrete deliverables, failure signals, mitigation plans, and decision gates.',
      'Call out performance regressions, memory usage, signing issues, user-facing fallback behavior, and success metrics after launch.',
    ].join('\n\n');

    fetchMock.mockResolvedValueOnce(new Response('data: [DONE]\n\n'));

    await collect(
      await streamDesktopLocalChat({
        client: {} as never,
        sessionId: 'session-2c',
        content: source,
        actionId: 'mindmap.generate',
        params: {},
        stream: true,
      })
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      stream: boolean;
      max_tokens: number;
      messages: Array<{ role: string; content: unknown }>;
    };
    const userContent = body.messages[1]?.content as Array<{
      type: string;
      text?: string;
    }>;

    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBe(4096);
    expect(body.messages[0]).toEqual(
      expect.objectContaining({
        role: 'system',
        content: expect.stringContaining(
          'Analyze the source deeply before structuring it'
        ),
      })
    );
    expect(userContent[0]).toEqual(
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining(
          'Analyze and expand the source below into a dense mind map.'
        ),
      })
    );
    expect(userContent[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining('Profile: expanded.'),
      })
    );
    expect(userContent[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining('Structure: paragraph.'),
      })
    );
    expect(userContent[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining('Source material:\n' + source),
      })
    );
  });

  test('falls back to the quality-biased local mindmap path after fast path context overflow for ultra-long documents', async () => {
    const paragraphs = Array.from({ length: 12 }, (_, index) =>
      [
        `Section ${index + 1}: AFFiNE desktop local AI rollout planning for area ${index + 1}.`,
        'Cover launch criteria, packaging quality, runtime validation, failure handling, support readiness, monitoring, and recovery plans in concrete detail.',
        'Explain owners, checkpoints, decision gates, fallback behavior, measurable signals for success or rollback, and the user-visible impact if this area regresses.',
        'Include concrete deliverables, failure signals, mitigation plans, dependencies, and verification checkpoints for this section before launch approval.',
      ].join(' ')
    );
    const source = paragraphs.join('\n\n');
    const streamedMindmap = [
      '- AFFiNE desktop local AI rollout',
      '  - Packaging',
      '    - binary staging',
      '  - Runtime validation',
      '    - health checks',
      '  - Support readiness',
      '    - escalation path',
    ].join('\n');

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message:
                'exceed_context_size_error: request exceeds the available context size',
            },
          }),
          {
            status: 400,
            headers: { 'content-type': 'application/json' },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          [
            `data: ${JSON.stringify({ choices: [{ delta: { content: streamedMindmap } }] })}`,
            '',
            'data: [DONE]',
            '',
          ].join('\n')
        )
      );

    await collect(
      await streamDesktopLocalChat({
        client: {} as never,
        sessionId: 'session-2quality-biased',
        content: source,
        actionId: 'mindmap.generate',
        params: {},
        stream: true,
      })
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [, fastInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const fastBody = JSON.parse(String(fastInit.body)) as {
      stream: boolean;
      max_tokens: number;
      messages: Array<{ role: string; content: unknown }>;
    };
    const fastUserContent = fastBody.messages[1]?.content as Array<{
      type: string;
      text?: string;
    }>;
    expect(fastBody.stream).toBe(true);
    expect(fastBody.max_tokens).toBe(4096);
    expect(fastUserContent[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining(
          'Analyze and expand the source below into a dense mind map.'
        ),
      })
    );
    expect(fastUserContent[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining(
          'Section 1: AFFiNE desktop local AI rollout planning for area 1.'
        ),
      })
    );

    const [, qualityInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const qualityBody = JSON.parse(String(qualityInit.body)) as {
      stream: boolean;
      max_tokens: number;
      messages: Array<{ role: string; content: unknown }>;
    };
    const qualityUserContent = qualityBody.messages[1]?.content as Array<{
      type: string;
      text?: string;
    }>;
    expect(qualityBody.stream).toBe(true);
    expect(qualityBody.max_tokens).toBe(4096);
    expect(qualityUserContent[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining(
          'Build the best mind map you can from the compressed source package below.'
        ),
      })
    );
    expect(qualityUserContent[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining('Document skeleton:'),
      })
    );
    expect(qualityUserContent[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining('High-value evidence passages:'),
      })
    );
    expect(qualityUserContent[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining('Evidence 1 |'),
      })
    );
    expect(qualityUserContent[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining('Coverage cues for lighter sections:'),
      })
    );
    expect(qualityUserContent[0]).not.toEqual(
      expect.objectContaining({
        text: expect.stringContaining('Source material:\n'),
      })
    );
  });

  test('appends a lightweight completion after a shallow quality-biased local mindmap draft', async () => {
    const paragraphs = Array.from({ length: 11 }, (_, index) =>
      [
        `Section ${index + 1}: AFFiNE desktop local AI readiness stream ${index + 1}.`,
        'Cover packaging, runtime health, fallback behavior, support preparation, monitoring signals, rollback gates, and verification evidence in explicit detail.',
        'Keep the section concrete with owners, dependencies, user-facing risks, validation checkpoints, and the impact of failure.',
        'Record the measurable signals that confirm this section is ready for launch or requires rollback.',
      ].join(' ')
    );
    const source = paragraphs.join('\n\n');
    const shallowDraft = [
      '- AFFiNE desktop local AI rollout',
      '- Packaging',
      '- Validation',
    ].join('\n');
    const supplement = ['  - Support readiness', '    - escalation path'].join(
      '\n'
    );

    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message:
                'exceed_context_size_error: request exceeds the available context size',
            },
          }),
          {
            status: 400,
            headers: { 'content-type': 'application/json' },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          [
            `data: ${JSON.stringify({ choices: [{ delta: { content: shallowDraft } }] })}`,
            '',
            'data: [DONE]',
            '',
          ].join('\n')
        )
      )
      .mockResolvedValueOnce(jsonCompletion(supplement));

    const result = await collect(
      await streamDesktopLocalChat({
        client: {} as never,
        sessionId: 'session-2quality-supplement',
        content: source,
        actionId: 'mindmap.generate',
        params: {},
        stream: true,
      })
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.join('')).toBe(`${shallowDraft}\n${supplement}`);

    const [, completionInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    const completionBody = JSON.parse(String(completionInit.body)) as {
      stream: boolean;
      max_tokens: number;
      messages: Array<{ role: string; content: unknown }>;
    };
    const completionUserContent = completionBody.messages[1]?.content as Array<{
      type: string;
      text?: string;
    }>;
    expect(completionBody.stream).toBe(false);
    expect(completionBody.max_tokens).toBe(1024);
    expect(completionUserContent[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining(
          'Return only additional Markdown nested unordered list lines that can be appended directly after the draft.'
        ),
      })
    );
    expect(completionUserContent[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining(`Draft mind map:\n${shallowDraft}`),
      })
    );
  });

  test('uses only system and user roles for local mindmap requests', async () => {
    fetchMock.mockResolvedValueOnce(new Response('data: [DONE]\n\n'));

    await collect(
      await streamDesktopLocalChat({
        client: {} as never,
        sessionId: 'session-2mindmap-roles',
        content: 'Release checklist',
        actionId: 'mindmap.generate',
        params: {},
        stream: true,
      })
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      messages: Array<{ role: string; content: unknown }>;
    };

    expect(body.messages.map(message => message.role)).toEqual([
      'system',
      'user',
    ]);
  });

  test('uses the compact title profile for short local mindmap actions', async () => {
    fetchMock.mockResolvedValueOnce(new Response('data: [DONE]\n\n'));

    await collect(
      await streamDesktopLocalChat({
        client: {} as never,
        sessionId: 'session-2d',
        content: 'Release checklist',
        actionId: 'mindmap.generate',
        params: {},
        stream: true,
      })
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      stream: boolean;
      messages: Array<{ role: string; content: unknown }>;
    };
    const userContent = body.messages[1]?.content as Array<{
      type: string;
      text?: string;
    }>;

    expect(body.stream).toBe(true);
    expect(userContent[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining('Profile: compact.'),
      })
    );
    expect(userContent[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining('Structure: title.'),
      })
    );
    expect(userContent[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining(
          'Treat the source as a topic title or heading.'
        ),
      })
    );
    expect(userContent[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining(
          'Analyze and expand the source below into a dense mind map.'
        ),
      })
    );
  });

  test('uses the list profile for list-shaped local mindmap actions', async () => {
    const source = [
      '- Packaging',
      '- Validation',
      '- Rollback',
      '- Monitoring',
    ].join('\n');

    fetchMock.mockResolvedValueOnce(new Response('data: [DONE]\n\n'));

    await collect(
      await streamDesktopLocalChat({
        client: {} as never,
        sessionId: 'session-2e',
        content: source,
        actionId: 'mindmap.generate',
        params: {},
        stream: true,
      })
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const userContent = body.messages[1]?.content as Array<{
      type: string;
      text?: string;
    }>;

    expect(userContent[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining('Structure: list.'),
      })
    );
    expect(userContent[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining(
          'Analyze and expand the source below into a dense mind map.'
        ),
      })
    );
    expect(userContent[0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining('Source material:\n' + source),
      })
    );
  });

  test('rethrows non-context-overflow fast path failures for local mindmap actions', async () => {
    fetchMock.mockRejectedValueOnce(new Error('socket closed'));

    await expect(
      collect(
        await streamDesktopLocalChat({
          client: {} as never,
          sessionId: 'session-2f',
          content: [
            'Plan the AFFiNE local AI desktop release.',
            'Cover packaging, runtime validation, performance checks, rollback plans, release communication, and post-release monitoring.',
            'Include risks, owners, checkpoints, and verification steps for each area.',
          ].join('\n\n'),
          actionId: 'mindmap.generate',
          params: {},
          stream: true,
        })
      )
    ).rejects.toThrow('socket closed');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('preserves string attachments in the posted local request body', async () => {
    fetchMock.mockResolvedValueOnce(new Response('data: [DONE]\n\n'));

    await collect(
      await streamDesktopLocalChat({
        client: {} as never,
        sessionId: 'session-3',
        attachments: ['attachment-1', 'attachment-2'],
        params: {},
        stream: true,
      })
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const userContent = body.messages[1]?.content as Array<{
      type: string;
      text?: string;
    }>;

    expect(userContent).toContainEqual({
      type: 'text',
      text: 'Referenced attachments:\n["attachment-1","attachment-2"]',
    });
  });

  test('omits binary image attachments from local Gemma requests', async () => {
    fetchMock.mockResolvedValueOnce(new Response('data: [DONE]\n\n'));

    await collect(
      await streamDesktopLocalChat({
        client: {} as never,
        sessionId: 'session-3b',
        attachments: [new File(['img'], 'selected.png', { type: 'image/png' })],
        params: {
          selectedMarkdown: '# Selected content',
        },
        stream: true,
      })
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const userContent = body.messages[1]?.content as Array<{
      type: string;
      text?: string;
    }>;

    expect(userContent).toContainEqual({
      type: 'text',
      text: 'Selected markdown:\n# Selected content',
    });
    expect(userContent.some(part => part.type === 'image_url')).toBe(false);
  });

  test('sanitizes local history into alternating user and assistant turns', async () => {
    fetchMock.mockResolvedValueOnce(new Response('data: [DONE]\n\n'));

    await collect(
      await streamDesktopLocalChat({
        client: {} as never,
        sessionId: 'session-3c',
        content: 'latest prompt',
        historyMessages: [
          { role: 'assistant', content: 'stale assistant' },
          { role: 'user', content: 'first question' },
          { role: 'user', content: 'replacement question' },
          { role: 'assistant', content: 'first answer' },
          { role: 'assistant', content: 'replacement answer' },
          { role: 'user', content: 'dangling user' },
        ],
        params: {},
        stream: true,
      })
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      messages: Array<{
        role: string;
        content: Array<{ type: string; text: string }> | string;
      }>;
    };

    expect(body.messages.slice(0, 3)).toEqual([
      expect.objectContaining({ role: 'system' }),
      {
        role: 'user',
        content: [{ type: 'text', text: 'replacement question' }],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'replacement answer' }],
      },
    ]);
    expect(body.messages[3]).toEqual({
      role: 'user',
      content: [{ type: 'text', text: 'latest prompt' }],
    });
  });

  test('surfaces local runtime response details for failed requests', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('Conversation roles must alternate', {
        status: 400,
      })
    );

    await expect(
      collect(
        await streamDesktopLocalChat({
          client: {} as never,
          sessionId: 'session-3d',
          content: 'latest prompt',
          params: {},
          stream: true,
        })
      )
    ).rejects.toThrow(
      'Local AI request failed with 400: Conversation roles must alternate'
    );
  });

  test('times out a stalled local stream', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start() {},
        })
      )
    );

    const pending = collect(
      await streamDesktopLocalChat({
        client: {} as never,
        sessionId: 'session-4',
        params: {},
        stream: true,
        timeout: 10,
      })
    );
    const expectation =
      expect(pending).rejects.toBeInstanceOf(RequestTimeoutError);

    await vi.advanceTimersByTimeAsync(10);

    await expectation;
  });

  test('surfaces local runtime detail when ensureReady returns an error status', async () => {
    electronApis.localAI.ensureReady.mockResolvedValueOnce({
      state: 'error',
      canRun: false,
      fallbackToServer: true,
      reason: 'spawn_failed',
      detail: 'binary missing',
      modelId: 'gemma-3-4b-it-local',
    });

    await expect(
      streamDesktopLocalChat({
        client: {} as never,
        sessionId: 'session-5',
        params: {},
        stream: true,
      })
    ).rejects.toThrow('Desktop local AI is not ready: binary missing');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
