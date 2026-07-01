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
  localAI: undefined as
    | {
        getStatus?: () => Promise<unknown>;
        ensureReady: () => Promise<unknown>;
      }
    | undefined,
}));

const createWorkspaceByokLocalLeaseMutation = vi.hoisted(() =>
  Symbol('createWorkspaceByokLocalLeaseMutation')
);

const desktopRoutePolicyMocks = vi.hoisted(() => ({
  resolveDesktopChatLane: vi.fn(),
}));

const localRuntimeClientMocks = vi.hoisted(() => ({
  streamDesktopLocalChat: vi.fn(),
}));

const aiModelProviderState = vi.hoisted(() => ({
  hasService: false,
  service: {
    modelId: { value: 'gemma-3-4b-it' },
    getActiveModelId: vi.fn(),
    getExecutionPreference: vi.fn(),
  },
}));

vi.mock('@affine/electron-api', () => ({
  apis: electronApis,
}));

vi.mock('./desktop-route-policy', () => desktopRoutePolicyMocks);
vi.mock('./local-runtime-client', () => localRuntimeClientMocks);
vi.mock('./ai-model-provider', () => ({
  hasAIModelService: () => aiModelProviderState.hasService,
  getAIModelService: () => aiModelProviderState.service,
}));

vi.mock('@affine/graphql', () => ({
  ByokKeyStorage: {
    server: 'server',
    local: 'local',
  },
  ByokProvider: {
    openai: 'openai',
    anthropic: 'anthropic',
    gemini: 'gemini',
    fal: 'fal',
    glm: 'glm',
    gemma: 'gemma',
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

async function* stream(chunks: string[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

async function drain(stream: AsyncIterable<unknown>) {
  for await (const chunk of stream) {
    void chunk;
  }
}

async function collectText(stream: AsyncIterable<string>) {
  const chunks: string[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

async function drainActionResult(
  stream: string | AsyncIterable<unknown> | undefined
) {
  expect(stream).toBeDefined();
  expect(typeof stream).not.toBe('string');
  await drain(stream as AsyncIterable<unknown>);
}

beforeEach(() => {
  aiModelProviderState.hasService = false;
  aiModelProviderState.service.modelId.value = 'gemma-3-4b-it';
  aiModelProviderState.service.getActiveModelId.mockReset();
  aiModelProviderState.service.getExecutionPreference.mockReset();
});

describe('runtime request transport BYOK local lease handling', () => {
  beforeEach(() => {
    vi.stubGlobal('BUILD_CONFIG', { isElectron: true });
    electronApis.localAI = undefined;
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
    electronApis.localAI = undefined;
    desktopRoutePolicyMocks.resolveDesktopChatLane.mockReset();
    localRuntimeClientMocks.streamDesktopLocalChat.mockReset();
    localRuntimeClientMocks.streamDesktopLocalChat.mockResolvedValue(
      stream(['local chunk'])
    );
  });

  test('routes gemma chat through local transport without creating a cloud session when ready', async () => {
    const client = createClient();
    const service = new AIRequestService(client);
    const localStatus = { state: 'ready', canRun: true };

    electronApis.localAI = {
      ensureReady: vi.fn().mockResolvedValue(localStatus),
    };
    desktopRoutePolicyMocks.resolveDesktopChatLane.mockResolvedValue({
      lane: 'local',
      reason: 'desktop_gemma_ready',
    });

    const result = (await service.executeAction('chat', {
      workspaceId: 'workspace-1',
      input: 'hello',
      modelId: 'gemma-3-4b-it',
      stream: true,
    })) as AsyncIterable<string>;

    await expect(collectText(result)).resolves.toEqual(['local chunk']);
    expect(
      desktopRoutePolicyMocks.resolveDesktopChatLane
    ).toHaveBeenCalledTimes(1);
    expect(desktopRoutePolicyMocks.resolveDesktopChatLane).toHaveBeenCalledWith(
      {
        requestAction: 'chat',
        modelId: 'gemma-3-4b-it',
        retry: undefined,
        localStatus,
      }
    );
    expect(localRuntimeClientMocks.streamDesktopLocalChat).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'gemma-3-4b-it',
        executionLane: 'local',
        localCapable: true,
        sessionId: undefined,
      })
    );
    expect(client.createSession).not.toHaveBeenCalled();
    expect(client.chatTextStream).not.toHaveBeenCalled();
  });

  test('keeps local transport when local status probe fails', async () => {
    const client = createClient();
    const service = new AIRequestService(client);
    const error = new Error('probe failed');
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    electronApis.localAI = {
      ensureReady: vi.fn().mockRejectedValue(error),
    };

    const result = (await service.executeAction('chat', {
      workspaceId: 'workspace-1',
      input: 'hello',
      modelId: 'gemma-3-4b-it',
      executionLane: 'local',
      stream: true,
    })) as AsyncIterable<string>;

    await expect(collectText(result)).resolves.toEqual(['local chunk']);
    expect(localRuntimeClientMocks.streamDesktopLocalChat).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'gemma-3-4b-it',
        executionLane: 'local',
        localCapable: undefined,
        sessionId: undefined,
      })
    );
    expect(client.createSession).not.toHaveBeenCalled();
    expect(client.chatTextStream).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalledWith(
      'Desktop local AI status probe failed, keeping local execution lane',
      error
    );
    consoleWarn.mockRestore();
  });

  test('does not fall back to server transport when the explicit local request fails before yielding', async () => {
    const client = createClient();
    const service = new AIRequestService(client);
    const error = new Error('local runtime failed');
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    electronApis.localAI = {
      ensureReady: vi.fn().mockResolvedValue({ state: 'ready', canRun: true }),
    };
    desktopRoutePolicyMocks.resolveDesktopChatLane.mockResolvedValue({
      lane: 'local',
      reason: 'desktop_gemma_ready',
    });
    localRuntimeClientMocks.streamDesktopLocalChat.mockRejectedValueOnce(error);

    const result = (await service.executeAction('chat', {
      workspaceId: 'workspace-1',
      input: 'hello',
      modelId: 'gemma-3-4b-it',
      executionLane: 'local',
      stream: true,
    })) as AsyncIterable<string>;

    await expect(collectText(result)).rejects.toThrow('local runtime failed');
    expect(client.createSession).not.toHaveBeenCalled();
    expect(client.chatTextStream).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalledWith(
      'Desktop local AI request failed, falling back to server',
      error
    );
    consoleWarn.mockRestore();
  });

  test('keeps explicit local text actions on the local transport when the local probe throws', async () => {
    const client = createClient();
    const service = new AIRequestService(client);
    const error = new Error('probe failed');
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    electronApis.localAI = {
      ensureReady: vi.fn().mockRejectedValue(error),
    };

    const result = (await service.executeAction('translate', {
      workspaceId: 'workspace-1',
      input: 'Bonjour tout le monde',
      lang: 'English',
      modelId: 'gemma-3-4b-it',
      executionLane: 'local',
      stream: true,
    })) as AsyncIterable<string>;

    await expect(collectText(result)).resolves.toEqual(['local chunk']);
    expect(localRuntimeClientMocks.streamDesktopLocalChat).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'gemma-3-4b-it',
        executionLane: 'local',
        sessionId: undefined,
        promptName: 'Translate to',
      })
    );
    expect(client.createSession).not.toHaveBeenCalled();
    expect(client.chatTextStream).not.toHaveBeenCalled();
    expect(consoleWarn).toHaveBeenCalledWith(
      'Desktop local AI status probe failed, keeping local execution lane',
      error
    );
    consoleWarn.mockRestore();
  });

  test('routes brainstormMindmap through local Gemma when execution lane is local', async () => {
    const client = createClient();
    const service = new AIRequestService(client);
    const localStatus = { state: 'ready', canRun: true };

    electronApis.localAI = {
      ensureReady: vi.fn().mockResolvedValue(localStatus),
    };
    desktopRoutePolicyMocks.resolveDesktopChatLane.mockResolvedValue({
      lane: 'local',
      reason: 'desktop_gemma_ready',
    });

    const result = (await service.executeAction('brainstormMindmap', {
      workspaceId: 'workspace-1',
      input: 'make a map',
      modelId: 'gemma-3-4b-it',
      executionLane: 'local',
      stream: true,
    })) as AsyncIterable<string>;

    await expect(collectText(result)).resolves.toEqual(['local chunk']);
    expect(localRuntimeClientMocks.streamDesktopLocalChat).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'gemma-3-4b-it',
        executionLane: 'local',
        promptName: 'mindmap.generate',
        content: 'make a map',
        sessionId: undefined,
      })
    );
    expect(client.createSession).not.toHaveBeenCalled();
    expect(client.chatTextStream).not.toHaveBeenCalled();
  });

  test('passes local text action prompt metadata to the desktop runtime', async () => {
    const client = createClient();
    const service = new AIRequestService(client);
    const localStatus = { state: 'ready', canRun: true };

    electronApis.localAI = {
      ensureReady: vi.fn().mockResolvedValue(localStatus),
    };
    desktopRoutePolicyMocks.resolveDesktopChatLane.mockResolvedValue({
      lane: 'local',
      reason: 'desktop_gemma_ready',
    });

    const result = (await service.executeAction('translate', {
      workspaceId: 'workspace-1',
      input: 'Bonjour tout le monde',
      lang: 'English',
      modelId: 'gemma-3-4b-it',
      executionLane: 'local',
      stream: true,
    })) as AsyncIterable<string>;

    await expect(collectText(result)).resolves.toEqual(['local chunk']);
    expect(localRuntimeClientMocks.streamDesktopLocalChat).toHaveBeenCalledWith(
      expect.objectContaining({
        promptName: 'Translate to',
        content: 'Bonjour tout le monde',
        params: { language: 'English' },
      })
    );
  });

  test('keeps explicit local brainstormMindmap requests on the local transport when Gemma is unavailable', async () => {
    const client = createClient();
    const service = new AIRequestService(client);
    const localStatus = {
      state: 'unsupported',
      canRun: false,
      fallbackToServer: true,
      reason: 'resources_missing',
      detail: 'binary missing',
      modelId: 'gemma-3-4b-it-local',
    };

    electronApis.localAI = {
      ensureReady: vi.fn().mockResolvedValue(localStatus),
    };
    desktopRoutePolicyMocks.resolveDesktopChatLane.mockResolvedValue({
      lane: 'server',
      reason: 'local_runtime_unavailable',
    });

    const result = (await service.executeAction('brainstormMindmap', {
      workspaceId: 'workspace-1',
      input: 'make a map',
      modelId: 'gemma-3-4b-it',
      executionLane: 'local',
      stream: true,
    })) as AsyncIterable<string>;

    await expect(collectText(result)).resolves.toEqual(['local chunk']);
    expect(localRuntimeClientMocks.streamDesktopLocalChat).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'gemma-3-4b-it',
        executionLane: 'local',
        sessionId: undefined,
        promptName: 'mindmap.generate',
      })
    );
    expect(client.createSession).not.toHaveBeenCalled();
    expect(client.chatTextStream).not.toHaveBeenCalled();
  });

  test('blocks image generation when local Gemma is selected on desktop', async () => {
    const client = createClient();
    const service = new AIRequestService(client);

    electronApis.localAI = {
      ensureReady: vi.fn(),
    };
    aiModelProviderState.hasService = true;
    aiModelProviderState.service.modelId.value = 'gemma-3-4b-it';
    aiModelProviderState.service.getActiveModelId.mockReturnValue(
      'gemma-3-4b-it'
    );
    aiModelProviderState.service.getExecutionPreference.mockReturnValue(
      'local'
    );

    await expect(
      service.executeAction('createImage', {
        workspaceId: 'workspace-1',
        input: 'draw a sunset',
      })
    ).rejects.toThrow(
      'This action is not supported by Local Gemma yet. Please log in to AFFiNE Cloud and switch Chat preference from Local to Cloud to continue.'
    );
    expect(client.createSession).not.toHaveBeenCalled();
    expect(client.imagesStream).not.toHaveBeenCalled();
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

  test('drops the gemma model id for cloud action requests that do not support server actions', async () => {
    const client = createClient();
    const service = new AIRequestService(client);

    aiModelProviderState.hasService = true;
    aiModelProviderState.service.modelId.value = 'gemma-3-4b-it';
    aiModelProviderState.service.getActiveModelId.mockReturnValue(
      'gemma-3-4b-it'
    );
    aiModelProviderState.service.getExecutionPreference.mockReturnValue(
      'cloud'
    );

    await drainActionResult(
      (await service.executeAction('brainstormMindmap', {
        workspaceId: 'workspace-1',
        input: 'make a map',
        modelId: 'gemma-3-4b-it',
        executionLane: 'server',
        stream: true,
      })) as AsyncIterable<unknown>
    );

    expect(client.chatTextStream).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: 'mindmap.generate',
        executionLane: 'server',
        modelId: undefined,
      }),
      Endpoint.Action
    );
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
