/**
 * @vitest-environment happy-dom
 */
import { UserFriendlyError } from '@affine/error';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { type CopilotClient, Endpoint } from './copilot-client';
import { textToText, toImage } from './message-transport';
import { AIRequestService } from './service';

Object.defineProperty(globalThis, 'EventSource', {
  configurable: true,
  value: {
    CLOSED: 2,
  },
});

const electronApis = vi.hoisted(() => ({
  byokStorage: undefined as
    | {
        isSupported: () => Promise<boolean>;
        getWorkspaceLeaseProviders: (workspaceId: string) => Promise<
          Array<{
            provider: string;
            name: string;
            apiKey: string;
            description?: string | null;
            endpoint?: string | null;
            sortOrder?: number | null;
            enabled?: boolean | null;
          }>
        >;
      }
    | undefined,
}));

const createWorkspaceByokLocalLeaseMutation = vi.hoisted(() =>
  Symbol('createWorkspaceByokLocalLeaseMutation')
);

vi.mock('@affine/electron-api', () => ({
  apis: electronApis,
}));

vi.mock('@affine/graphql', () => ({
  ByokProvider: {
    openai: 'openai',
    anthropic: 'anthropic',
    gemini: 'gemini',
    fal: 'fal',
  },
  ContextCategories: {
    Tag: 'tag',
    Collection: 'collection',
  },
  createWorkspaceByokLocalLeaseMutation,
}));

function createClosedEventSource(): EventSource {
  return {
    readyState: EventSource.CLOSED,
    addEventListener: vi.fn(),
    close: vi.fn(),
  } as unknown as EventSource;
}

function createClient(
  overrides: Partial<
    Pick<
      CopilotClient,
      | 'gql'
      | 'createSession'
      | 'createMessage'
      | 'getSessions'
      | 'getHistories'
      | 'chatTextStream'
      | 'imagesStream'
    >
  > = {}
) {
  return {
    gql: vi.fn().mockResolvedValue({
      createWorkspaceByokLocalLease: { leaseId: 'lease-1' },
    }),
    createSession: vi.fn().mockImplementation(async options => {
      return `session:${options.promptName}`;
    }),
    createMessage: vi.fn().mockResolvedValue('message-1'),
    getSessions: vi.fn().mockResolvedValue([]),
    getHistories: vi.fn().mockResolvedValue([]),
    chatTextStream: vi.fn(() => createClosedEventSource()),
    imagesStream: vi.fn(() => createClosedEventSource()),
    ...overrides,
  } as unknown as CopilotClient;
}

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

describe('runtime request transport BYOK local lease handling', () => {
  beforeEach(() => {
    vi.stubGlobal('BUILD_CONFIG', { isElectron: true });
    electronApis.byokStorage = {
      isSupported: vi.fn().mockResolvedValue(true),
      getWorkspaceLeaseProviders: vi.fn().mockResolvedValue([
        {
          provider: 'openai',
          name: 'OpenAI',
          apiKey: 'sk-local',
        },
      ]),
    };
  });

  test('fails closed when local BYOK providers exist but lease creation fails', async () => {
    const client = createClient({
      gql: vi.fn().mockRejectedValue(new Error('mutation failed')),
    });

    const result = textToText({
      client,
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
      content: 'hello',
    }) as Promise<string>;

    await expect(result).rejects.toThrow('mutation failed');
    await expect(result).rejects.toBeInstanceOf(UserFriendlyError);
    expect(client.chatTextStream).not.toHaveBeenCalled();
  });

  test('does not create stream local BYOK lease after cancellation', async () => {
    const controller = new AbortController();
    const client = createClient({
      createMessage: vi.fn().mockImplementation(async () => {
        controller.abort();
        return 'message-1';
      }),
    });

    await drain(
      textToText({
        client,
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
        content: 'hello',
        stream: true,
        signal: controller.signal,
      }) as AsyncIterable<string>
    );

    expect(client.gql).not.toHaveBeenCalled();
    expect(client.chatTextStream).not.toHaveBeenCalled();
  });

  test('does not create image stream when cancelled while creating local BYOK lease', async () => {
    const controller = new AbortController();
    const client = createClient({
      gql: vi.fn().mockImplementation(async () => {
        controller.abort();
        return { createWorkspaceByokLocalLease: { leaseId: 'lease-1' } };
      }),
    });

    await drain(
      toImage({
        client,
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
        content: 'image',
        endpoint: Endpoint.Images,
        signal: controller.signal,
      }) as AsyncIterable<string>
    );

    expect(client.gql).toHaveBeenCalled();
    expect(client.imagesStream).not.toHaveBeenCalled();
  });
});

describe('AIRequestService action definitions', () => {
  beforeEach(() => {
    vi.stubGlobal('BUILD_CONFIG', { isElectron: false });
    electronApis.byokStorage = undefined;
  });

  test('routes action-stream requests through action endpoint', async () => {
    const client = createClient();
    const service = new AIRequestService(client);

    await drainActionResult(
      (await service.executeAction('brainstormMindmap', {
        workspaceId: 'workspace-1',
        input: 'make a map',
        stream: true,
      })) as AsyncIterable<unknown>
    );
    await drainActionResult(
      (await service.executeAction('createSlides', {
        workspaceId: 'workspace-1',
        input: 'make slides',
        stream: true,
      })) as AsyncIterable<unknown>
    );
    await drainActionResult(
      (await service.executeAction('filterImage', {
        workspaceId: 'workspace-1',
        input: 'convert',
        attachments: ['blob-1'],
        style: 'Sketch style',
      })) as AsyncIterable<unknown>
    );

    expect(client.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ promptName: 'mindmap.generate' })
    );
    expect(client.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ promptName: 'slides.outline' })
    );
    expect(client.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ promptName: 'image.filter.sketch' })
    );
    expect(client.chatTextStream).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: 'mindmap.generate' }),
      Endpoint.Action
    );
    expect(client.chatTextStream).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: 'slides.outline' }),
      Endpoint.Action
    );
    expect(client.chatTextStream).toHaveBeenCalledWith(
      expect.objectContaining({ actionId: 'image.filter.sketch' }),
      Endpoint.Action
    );
    expect(client.imagesStream).not.toHaveBeenCalled();
  });

  test('reuses the last action session for retry', async () => {
    const client = createClient();
    const service = new AIRequestService(client);

    await drainActionResult(
      (await service.executeAction('summary', {
        workspaceId: 'workspace-1',
        input: 'summarize',
        stream: true,
      })) as AsyncIterable<unknown>
    );
    await drainActionResult(
      (await service.executeAction('summary', {
        workspaceId: 'workspace-1',
        input: 'summarize again',
        retry: true,
        stream: true,
      })) as AsyncIterable<unknown>
    );

    expect(client.createSession).toHaveBeenCalledTimes(1);
    expect(client.createMessage).toHaveBeenCalledTimes(1);
    expect(client.chatTextStream).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sessionId: 'session:Summary',
        retry: true,
      }),
      Endpoint.StreamObject
    );
  });

  test('reports action result against the matching host action', async () => {
    const client = createClient();
    const service = new AIRequestService(client);
    const events: string[] = [];
    const hostOne = {} as NonNullable<
      BlockSuitePresets.AITextActionOptions['host']
    >;
    const hostTwo = {} as NonNullable<
      BlockSuitePresets.AITextActionOptions['host']
    >;
    const subscription = service.actionEvents$.subscribe(event => {
      events.push(
        `${event.options.host === hostOne ? 'one' : 'two'}:${event.event}`
      );
    });

    await drainActionResult(
      (await service.executeAction('summary', {
        workspaceId: 'workspace-1',
        input: 'first',
        host: hostOne,
        stream: true,
      })) as AsyncIterable<unknown>
    );
    await drainActionResult(
      (await service.executeAction('translate', {
        workspaceId: 'workspace-1',
        input: 'second',
        lang: 'French',
        host: hostTwo,
        stream: true,
      })) as AsyncIterable<unknown>
    );

    service.reportLastAction('result:insert', hostOne);
    subscription.unsubscribe();

    expect(events).toContain('one:result:insert');
  });

  test('loads sessions through history query with messages', async () => {
    const history = {
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
      docId: 'doc-1',
      messages: [{ id: 'message-1', role: 'user', content: 'hello' }],
    };
    const client = createClient({
      getHistories: vi.fn().mockResolvedValue([history]),
    });
    const service = new AIRequestService(client);

    const session = await service.getSession('workspace-1', 'session-1');

    expect(client.getHistories).toHaveBeenCalledWith(
      'workspace-1',
      {},
      undefined,
      expect.objectContaining({
        sessionId: 'session-1',
        withMessages: true,
      })
    );
    expect(session?.messages).toEqual(history.messages);
  });

  test('loads chat history lists with messages for title derivation', async () => {
    const client = createClient();
    const service = new AIRequestService(client);

    await service.getSessions('workspace-1', 'doc-1', {
      action: false,
      fork: false,
    });
    await service.getRecentSessions('workspace-1', 10, 20);

    expect(client.getSessions).toHaveBeenCalledWith(
      'workspace-1',
      {},
      'doc-1',
      expect.objectContaining({
        action: false,
        fork: false,
        withMessages: true,
      }),
      undefined
    );
    expect(client.getHistories).toHaveBeenCalledWith(
      'workspace-1',
      { first: 10, offset: 20 },
      undefined,
      expect.objectContaining({
        action: false,
        fork: false,
        sessionOrder: 'desc',
        withMessages: true,
      })
    );
  });
});
