/**
 * @vitest-environment happy-dom
 */
import { BehaviorSubject } from 'rxjs';
import { describe, expect, test, vi } from 'vitest';

import { AIProvider } from './ai-provider';
import { CopilotClient, Endpoint } from './copilot-client';
import { setupAIProvider } from './setup-provider';

Object.defineProperty(globalThis, 'EventSource', {
  configurable: true,
  value: {
    CLOSED: 2,
  },
});

type SetupAIProviderArgs = Parameters<typeof setupAIProvider>;
type ActionInput<T extends keyof BlockSuitePresets.AIActions> = Parameters<
  NonNullable<BlockSuitePresets.AIActions[T]>
>[0];

async function drain(stream: AsyncIterable<unknown>) {
  for await (const chunk of stream) {
    void chunk;
  }
}

async function drainActionResult(
  stream: string | AsyncIterable<unknown> | undefined
) {
  expect(stream).toBeDefined();
  expect(typeof stream).not.toBe('string');
  await drain(stream as AsyncIterable<unknown>);
}

function createClosedEventSource(): EventSource {
  return {
    readyState: EventSource.CLOSED,
    addEventListener: vi.fn(),
    close: vi.fn(),
  } as unknown as EventSource;
}

describe('setupAIProvider action migrations', () => {
  test('routes mindmap, slides and image filter through action API', async () => {
    const createdSessions: unknown[] = [];
    const textStreams: unknown[] = [];
    const client = new CopilotClient(
      vi.fn(),
      vi.fn(() => createClosedEventSource())
    );
    vi.spyOn(client, 'createSession').mockImplementation(async options => {
      createdSessions.push(options);
      return `session:${options.promptName}`;
    });
    vi.spyOn(client, 'createMessage').mockResolvedValue('message-1');
    vi.spyOn(client, 'chatTextStream').mockImplementation(
      (options, endpoint) => {
        textStreams.push({ options, endpoint });
        return createClosedEventSource();
      }
    );
    vi.spyOn(client, 'imagesStream').mockReturnValue(createClosedEventSource());

    setupAIProvider(
      client,
      { open: vi.fn() } as unknown as SetupAIProviderArgs[1],
      {
        session: {
          account$: new BehaviorSubject(null),
        },
      } as unknown as SetupAIProviderArgs[2]
    );

    await drainActionResult(
      await AIProvider.actions.brainstormMindmap?.({
        workspaceId: 'workspace-1',
        input: 'make a map',
        stream: true,
      } satisfies ActionInput<'brainstormMindmap'>)
    );
    await drainActionResult(
      await AIProvider.actions.createSlides?.({
        workspaceId: 'workspace-1',
        input: 'make slides',
        stream: true,
      } satisfies ActionInput<'createSlides'>)
    );
    await drainActionResult(
      await AIProvider.actions.filterImage?.({
        workspaceId: 'workspace-1',
        input: 'convert',
        attachments: ['blob-1'],
        style: 'Sketch style',
      } satisfies ActionInput<'filterImage'>)
    );

    expect(createdSessions).toEqual([
      expect.objectContaining({ promptName: 'mindmap.generate' }),
      expect.objectContaining({ promptName: 'slides.outline' }),
      expect.objectContaining({ promptName: 'image.filter.sketch' }),
    ]);
    expect(textStreams).toEqual([
      expect.objectContaining({
        endpoint: Endpoint.Action,
        options: expect.objectContaining({ actionId: 'mindmap.generate' }),
      }),
      expect.objectContaining({
        endpoint: Endpoint.Action,
        options: expect.objectContaining({ actionId: 'slides.outline' }),
      }),
      expect.objectContaining({
        endpoint: Endpoint.Action,
        options: expect.objectContaining({ actionId: 'image.filter.sketch' }),
      }),
    ]);
    expect(client.imagesStream).not.toHaveBeenCalled();
  });
});
