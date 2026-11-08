/**
 * @vitest-environment happy-dom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { UserFriendlyError } from '@affine/error';
import type { EditorHost } from '@blocksuite/affine/std';
import type { GfxModel } from '@blocksuite/affine/std/gfx';
import { BehaviorSubject, Subject } from 'rxjs';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { DelegatedEditorHost } from '../frontend/delegated-editor-host';
import { readNodes } from '../frontend/live-projection';
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
            credential: string;
            definition: {
              version: number;
              endpoint: { kind: string; url?: string | null };
              models: unknown[];
            };
            description?: string | null;
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
          credential: 'sk-local',
          definition: {
            endpoint: { kind: 'provider_default' },
            models: [{ modelId: 'model-1', capabilities: [] }],
          },
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

  test('manages the active delegated editor and its live projection contract', async () => {
    const service = new AIRequestService(createClient());
    const started: string[] = [];
    const synced: string[] = [];
    const disposed: string[] = [];
    service.setActiveEditorFactory(sessionId => ({
      start: async () => {
        started.push(sessionId);
      },
      sync: async () => {
        synced.push(sessionId);
      },
      dispose: () => {
        disposed.push(sessionId);
      },
      context: () => JSON.stringify({ session_id: sessionId }),
    }));

    await service.activateEditor('session-1');
    await service.activateEditor('session-1');
    await service.activateEditor('session-2');
    expect(service.getActiveEditorContext()).toBe(
      JSON.stringify({ session_id: 'session-2' })
    );
    service.setActiveEditorFactory(undefined);

    expect(started).toEqual(['session-1', 'session-2']);
    expect(synced).toEqual(['session-1']);
    expect(disposed).toEqual(['session-1', 'session-2']);

    vi.useFakeTimers();
    try {
      const blockUpdated$ = new Subject<void>();
      const selectionChanged$ = new Subject<void>();
      const viewportUpdated$ = new Subject<void>();
      const viewportSizeUpdated$ = new Subject<void>();
      const toolRequests$ = new Subject<never>();
      const selectedElements: Array<{ id: string }> = [];
      const requests: Array<{ op: string; input: Record<string, unknown> }> =
        [];
      let holdNextUpsert = false;
      let resolveHeldUpsert: (() => void) | undefined;
      const realtime = {
        subscribe: vi.fn(() => toolRequests$),
        request: vi.fn(async (op: string, input: Record<string, unknown>) => {
          requests.push({ op, input });
          if (holdNextUpsert && op.endsWith('.upsert')) {
            await new Promise<void>(resolve => {
              resolveHeldUpsert = resolve;
            });
          }
          return { ok: true };
        }),
      };
      const delegatedHost = new DelegatedEditorHost({
        realtime: realtime as never,
        host: {
          store: {
            readonly$: new BehaviorSubject(false),
            slots: Object.fromEntries([['blockUpdated', blockUpdated$]]),
          },
          selection: {
            slots: Object.fromEntries([['changed', selectionChanged$]]),
          },
          std: {
            get: () => ({
              getEditorMode: () => 'edgeless',
              selection: { selectedElements },
              viewport: Object.fromEntries([
                ['viewportUpdated', viewportUpdated$],
                ['sizeUpdated', viewportSizeUpdated$],
              ]),
            }),
          },
        } as unknown as EditorHost,
        sessionId: 'session-1',
        workspaceId: 'workspace-1',
        docId: 'doc-1',
      });

      await delegatedHost.start();
      selectionChanged$.next();
      await vi.advanceTimersByTimeAsync(150);
      expect(requests.filter(item => item.op.endsWith('.upsert'))).toHaveLength(
        1
      );

      selectedElements.push({ id: 'element-1' });
      selectionChanged$.next();
      selectionChanged$.next();
      await vi.advanceTimersByTimeAsync(150);
      const selectionUpserts = requests.filter(item =>
        item.op.endsWith('.upsert')
      );
      expect(selectionUpserts).toHaveLength(2);
      expect(selectionUpserts[1].input.editorStateId).not.toBe(
        selectionUpserts[0].input.editorStateId
      );

      blockUpdated$.next();
      blockUpdated$.next();
      blockUpdated$.next();
      await vi.advanceTimersByTimeAsync(150);
      expect(requests.filter(item => item.op.endsWith('.upsert'))).toHaveLength(
        3
      );

      holdNextUpsert = true;
      blockUpdated$.next();
      await vi.advanceTimersByTimeAsync(150);
      blockUpdated$.next();
      const sync = delegatedHost.sync();
      holdNextUpsert = false;
      resolveHeldUpsert?.();
      await sync;
      const synchronizedUpserts = requests.filter(item =>
        item.op.endsWith('.upsert')
      );
      expect(synchronizedUpserts).toHaveLength(5);
      expect(synchronizedUpserts[4].input.editorStateId).not.toBe(
        synchronizedUpserts[3].input.editorStateId
      );
      delegatedHost.dispose();
    } finally {
      vi.useRealTimers();
    }

    const fixture = JSON.parse(
      readFileSync(
        join(
          process.cwd(),
          'packages/frontend/core/src/blocksuite/ai/runtime/request/__fixtures__/live-projection-contract.json'
        ),
        'utf8'
      )
    );
    const document = fixture.documents[0];
    const expectation = fixture.expectations[0];
    const frameSource = document.pageBlocks.find(
      (block: { id: string }) => block.id === expectation.frame.id
    );
    const frame = {
      id: frameSource.id,
      flavour: `affine:${frameSource.type}`,
      xywh: JSON.stringify([
        frameSource.bounds.x,
        frameSource.bounds.y,
        frameSource.bounds.width,
        frameSource.bounds.height,
      ]),
      props: {
        title: frameSource.title,
        childElementIds: frameSource.childIds,
      },
      group: null,
      groups: [],
    } as unknown as GfxModel;
    const elements = document.surfaceElements.map(
      (source: Record<string, unknown>) =>
        ({
          id: source.id,
          flavour: source.type,
          xywh: JSON.stringify([
            (source.bounds as { x: number }).x,
            (source.bounds as { y: number }).y,
            (source.bounds as { width: number }).width,
            (source.bounds as { height: number }).height,
          ]),
          props: {
            ...source,
            source: source.sourceId ? { id: source.sourceId } : undefined,
            target: source.targetId ? { id: source.targetId } : undefined,
          },
          group: source.id === expectation.connector.id ? frame : null,
          groups: source.id === expectation.connector.id ? [frame] : [],
        }) as unknown as GfxModel
    );
    const mindmapRoot = elements.find(
      (element: GfxModel) => element.id === 'mindmap-01'
    );
    const mindmapLeaf = elements.find(
      (element: GfxModel) => element.id === 'mindmap-02'
    );
    if (!mindmapRoot || !mindmapLeaf) {
      throw new Error('Anonymous contract fixture is missing mindmap nodes');
    }
    (
      mindmapRoot as unknown as { props: Record<string, unknown> }
    ).props.children = {
      [mindmapLeaf.id]: {
        parent: mindmapRoot.id,
        index: document.surfaceElements.find(
          (element: { id: string }) => element.id === mindmapLeaf.id
        ).index,
      },
    };
    (mindmapLeaf as unknown as { group: GfxModel }).group = mindmapRoot;
    (mindmapLeaf as unknown as { groups: GfxModel[] }).groups = [mindmapRoot];
    const models = new Map(
      [frame, ...elements].map(model => [model.id, model])
    );
    const projection = readNodes(
      {
        store: { getBlock: () => undefined },
        std: {
          get: () => ({ getElementById: (id: string) => models.get(id) }),
        },
      } as unknown as EditorHost,
      'editor-state-1',
      { element_ids: [...models.keys()] }
    );
    const values = projection.items.map(item =>
      'value' in item && item.value && 'type' in item.value
        ? item.value
        : undefined
    );
    const frameValue = values.find(value => value?.id === expectation.frame.id);
    const connectorValue = values.find(
      value => value?.id === expectation.connector.id
    );
    const mindmapRootValue = values.find(value => value?.id === 'mindmap-01');
    const mindmapLeafValue = values.find(value => value?.id === 'mindmap-02');
    const brushValue = values.find(value => value?.id === 'brush-01');
    const unknownValue = values.find(value => value?.id === 'unknown-01');

    expect(frameValue).toMatchObject({
      type: 'frame',
      child_ids: expectation.frame.childIds,
    });
    expect(connectorValue).toMatchObject({
      type: 'connector',
      frame_id: expectation.frame.id,
      source_id: expectation.connector.sourceId,
      target_id: expectation.connector.targetId,
    });
    expect(mindmapRootValue).toMatchObject({ child_ids: ['mindmap-02'] });
    expect(mindmapLeafValue).toMatchObject({
      parent_id: 'mindmap-01',
      index: '0',
    });
    expect(brushValue).toMatchObject({ type: 'brush', point_count: 4 });
    expect(unknownValue).toMatchObject({ type: 'fixture-unknown' });
    expect(values.slice(1).map(value => value?.type)).toEqual(
      document.surfaceElements.map((element: { type: string }) => element.type)
    );
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
