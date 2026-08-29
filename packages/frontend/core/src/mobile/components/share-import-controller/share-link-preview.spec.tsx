/** @vitest-environment happy-dom */

import { Server, ServersService } from '@affine/core/modules/cloud';
import { readAllBlocksFromDoc } from '@affine/reader';
import { parseSharePreviewBlob } from '@blocksuite/affine/model';
import {
  ImportClipperService,
  type ShareImportInput,
} from '@affine/core/modules/import-clipper';
import {
  type WorkspaceMetadata,
  WorkspacesService,
} from '@affine/core/modules/workspace';
import { ServerDeploymentType, ServerFeature } from '@affine/graphql';
import { ToggleButton } from '@blocksuite/affine/components/toggle-button';
import {
  type LinkPreviewCacheProvider,
  LinkPreviewService,
} from '@blocksuite/affine/shared/services';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Framework } from '@toeverything/infra';
import type * as Infra from '@toeverything/infra';
import { notify } from '@affine/component';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { Array as YArray, Doc as YDoc, Map as YMap, Text as YText } from 'yjs';

import {
  createAffineLinkPreviewFetch,
  resolveLinkPreviewEndpoint,
} from '../../../blocksuite/view-extensions/link-preview-service/link-preview-service';
import {
  createCompatibilityShareBlockPlan,
  createShareMarkdown,
} from '../../../modules/import-clipper/services/import';
import { CollectionService } from '../../../modules/collection';
import { DocsService } from '../../../modules/doc';
import { DocsSearchService } from '../../../modules/docs-search';
import { UnusedBlobs } from '../../../modules/blob-management/entity/unused-blobs';
import { GuardService } from '../../../modules/permissions';
import { TagService } from '../../../modules/tag';
import { shareImportBlockIds } from '../../../modules/import-clipper/services/share-block-plan';
import { WorkspaceService } from '../../../modules/workspace';
import { WorkspaceFlavoursService } from '../../../modules/workspace/services/flavours';
import { previewForImport, ShareImportController } from './index';
import {
  LinkPreview,
  resolveShareTitle,
  transcriptPreviewText,
} from './link-preview';
import {
  resolveShareWorkspaceMode,
  SharePreviewRouteOwner,
} from './preview-route-owner';
import type { PendingShareItem, ShareLinkPreview } from './types';

const controllerServiceMocks = vi.hoisted(() => ({
  services: new Map<string, unknown>(),
}));

vi.mock('@toeverything/infra', async importOriginal => {
  const original = await importOriginal<typeof Infra>();
  return {
    ...original,
    useLiveData: (source: { value: unknown }) => source.value,
    useService: (token: { name: string }) =>
      controllerServiceMocks.services.get(token.name),
  };
});

const cache: LinkPreviewCacheProvider = {
  get: () => undefined,
  set: () => {},
  getPendingRequest: () => undefined,
  setPendingRequest: () => {},
  deletePendingRequest: () => {},
  clear: () => {},
};

const item = (previewRoute?: 'official' | 'deferred') =>
  ({
    id: 'item',
    documentId: 'doc',
    schemaVersion: 2,
    importAttemptId: 'attempt',
    title: 'Shared',
    content: { kind: 'url', url: 'https://youtube.com/watch?v=123' },
    ...(previewRoute ? { previewRoute } : {}),
  }) as unknown as PendingShareItem;

const workspace = (flavour: string) =>
  ({ id: 'workspace', flavour }) as WorkspaceMetadata;

const server = (id: string, baseUrl: string, type?: ServerDeploymentType) =>
  ({
    id,
    baseUrl,
    config$: { value: { type } },
    fetch: (...args: Parameters<typeof globalThis.fetch>) =>
      globalThis.fetch(...args),
  }) as unknown as Server;

type TestBlock = {
  id: string;
  flavour: string;
  parentId?: string;
  props?: Record<string, unknown>;
};

function makeShareWriterHarness({
  receipt,
  recordExists = false,
  blocks = [],
}: {
  receipt?: string;
  recordExists?: boolean;
  blocks?: TestBlock[];
} = {}) {
  const models = new Map<
    string,
    {
      id: string;
      flavour: string;
      parent?: { id: string };
      props: Record<string, any>;
    }
  >();
  for (const block of blocks) {
    models.set(block.id, {
      id: block.id,
      flavour: block.flavour,
      parent: block.parentId ? { id: block.parentId } : undefined,
      props: { ...block.props },
    });
  }
  const blockSuiteDoc = {
    getBlock: (id: string) => {
      const model = models.get(id);
      return model ? { id, model } : undefined;
    },
    getBlocksByFlavour: (flavour: string) =>
      [...models.values()]
        .filter(model => model.flavour === flavour)
        .map(model => ({ id: model.id, model })),
    addBlock: (
      flavour: string,
      props: Record<string, any>,
      parentId?: string
    ) => {
      const id = props.id as string;
      const storedProps =
        flavour === 'affine:page'
          ? {
              ...props,
              title: {
                value: '',
                get length() {
                  return this.value.length;
                },
                toString() {
                  return this.value;
                },
                delete() {
                  this.value = '';
                },
                insert(value: string) {
                  this.value = value;
                },
              },
            }
          : props;
      models.set(id, {
        id,
        flavour,
        parent: parentId ? { id: parentId } : undefined,
        props: storedProps,
      });
      return id;
    },
  };
  const record = {
    id: 'doc',
    meta$: { value: { tags: [] as string[], title: '' } },
    setMeta: vi.fn((meta: { title: string }) => {
      record.meta$.value = { ...record.meta$.value, ...meta };
    }),
  };
  let currentRecord: typeof record | undefined = recordExists
    ? record
    : undefined;
  let receiptValue = receipt;
  const docs = {
    list: { doc$: vi.fn(() => ({ value: currentRecord })) },
    getCustomPropertyById: vi.fn(() => receiptValue),
    setCustomPropertyById: vi.fn((_id, _property, value: string) => {
      receiptValue = value;
    }),
    createDoc: vi.fn(() => {
      currentRecord = record;
      return record;
    }),
    open: vi.fn(() => ({
      doc: {
        waitForSyncReady: vi.fn(),
        blockSuiteDoc,
      },
      release: vi.fn(),
    })),
  };
  const guard = { can: vi.fn(async () => true) };
  const tagService = {
    tagList: {
      tags$: { value: [] },
      tagByTagId$: vi.fn(() => ({ value: { tag: vi.fn() } })),
    },
  };
  const collectionService = {
    collectionMetas$: { value: [] },
    addDocToCollection: vi.fn(),
  };
  const blobSet = vi.fn(async (_blob: Blob) => 'details-content-hash');
  const engine = {
    addPriority: vi.fn(),
    waitForDocReady: vi.fn(),
    waitForDocLoaded: vi.fn(),
    waitForUpdated: vi.fn(),
    waitForSynced: vi.fn(),
  };
  const metadata = {
    id: 'workspace',
    flavour: 'self',
  } as WorkspaceMetadata;
  const workspaceValue = {
    id: metadata.id,
    meta: { flavour: metadata.flavour },
    engine: { doc: engine },
    docCollection: { blobSync: { set: blobSet } },
    scope: {
      get: (token: unknown) => {
        if (token === DocsService) return docs;
        if (token === GuardService) return guard;
        if (token === TagService) return tagService;
        if (token === CollectionService) return collectionService;
        throw new Error('Unexpected service token');
      },
    },
  };
  const workspaces = {
    list: {
      workspaces$: { value: [metadata] },
      waitForRevalidation: vi.fn(),
    },
    open: vi.fn(() => ({ workspace: workspaceValue, dispose: vi.fn() })),
  } as unknown as WorkspacesService;
  const service = Object.assign(Object.create(ImportClipperService.prototype), {
    workspacesService: workspaces,
    shareImportTails: new Map(),
  }) as ImportClipperService;

  return { service, metadata, models, blobSet, docs };
}

function writerInput(preview?: ShareLinkPreview): ShareImportInput {
  return {
    documentId: 'doc',
    importAttemptId: 'attempt',
    title: 'Shared',
    content: {
      kind: 'url',
      url: preview?.url ?? 'https://example.com/article',
    },
    preview,
    tagIds: [],
  };
}

function routedPreviewServer({
  preview,
  freshConfig,
}: {
  preview: ShareLinkPreview;
  freshConfig: (signal: AbortSignal) => Promise<unknown>;
}) {
  const selected = server(
    'self',
    'https://self.example/',
    ServerDeploymentType.Selfhosted
  );
  Object.assign(selected, {
    config$: {
      value: {
        type: ServerDeploymentType.Selfhosted,
        features: [ServerFeature.SharePreviewBlobRefs],
      },
    },
    fetch: vi.fn().mockResolvedValue(
      new Response(JSON.stringify(preview), {
        status: 200,
      })
    ),
    fetchFreshConfig: vi.fn(freshConfig),
  });
  return selected;
}

async function loadRoutedPreview(
  preview: ShareLinkPreview,
  selectedServer: Server
) {
  const pending = {
    ...item(),
    content: { kind: 'url', url: preview.url },
  } as PendingShareItem;
  const owner = new SharePreviewRouteOwner(pending, { gateCApproved: true });
  owner.selectWorkspace(workspace('self'), [selectedServer]);
  return { owner, preview: await owner.load() };
}

async function withTestDeadline<T>(promise: Promise<T>, timeoutMs = 1800) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Authorization did not time out')),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

afterEach(() => {
  cleanup();
  controllerServiceMocks.services.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('link preview transport and route ownership', () => {
  test('does not let a legacy official preview route override a local workspace', () => {
    const officialFetch = vi.fn();
    const legacyItem = {
      ...item(),
      previewRoute: 'official',
    } as unknown as PendingShareItem;
    const owner = new SharePreviewRouteOwner(legacyItem);
    const cloudServer = server(
      'cloud',
      'https://app.affine.pro',
      ServerDeploymentType.Affine
    );
    Object.assign(cloudServer, { fetch: officialFetch });

    owner.selectWorkspace(workspace('local'), [cloudServer]);

    expect(owner.routeEndpoint).toBeUndefined();
    expect(owner.load()).toBeUndefined();
    expect(officialFetch).not.toHaveBeenCalled();
  });

  test('uses the selected workspace server with a relative URL-only preview request', async () => {
    const serverFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: item().content.url }), {
        status: 200,
      })
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ url: item().content.url }), {
          status: 200,
        })
      )
    );
    const selectedServer = server(
      'self',
      'https://self.example/',
      ServerDeploymentType.Selfhosted
    );
    Object.assign(selectedServer, { fetch: serverFetch });
    const owner = new SharePreviewRouteOwner(item());

    owner.selectWorkspace(workspace('self'), [selectedServer]);

    await expect(owner.load()).resolves.toEqual({ url: item().content.url });
    expect(serverFetch).toHaveBeenCalledWith('/api/worker/link-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: item().content.url }),
      credentials: 'omit',
      signal: expect.any(AbortSignal),
    });
  });

  test('adds the app version only in the AFFiNE transport', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ title: 'Preview' }), { status: 200 })
      );
    const service = new LinkPreviewService(
      cache,
      createAffineLinkPreviewFetch('0.27.0', fetch)
    );
    service.setEndpoint('https://self.example/api/worker/link-preview');

    await service.query('https://example.com/versioned');

    const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('x-affine-version')).toBe('0.27.0');
  });

  test.each([
    ['', null],
    ['   ', null],
    ['/', null],
    [
      '/api/worker/link-preview',
      'https://self.example/api/worker/link-preview',
    ],
    [
      'https://preview.example/api/worker/link-preview',
      'https://preview.example/api/worker/link-preview',
    ],
  ])('validates configured endpoint %j', (value, endpoint) => {
    expect(resolveLinkPreviewEndpoint(value, 'https://self.example/')).toBe(
      endpoint
    );
  });

  test.each([
    ['missing endpoint', null, undefined],
    [
      'timeout',
      'https://self.example/api/worker/link-preview',
      new DOMException('Timed out', 'AbortError'),
    ],
    [
      'server error',
      'https://self.example/api/worker/link-preview',
      new Response(null, { status: 500 }),
    ],
  ])(
    'returns no preview on %s without a fallback',
    async (_name, endpoint, result) => {
      const fetch = vi.fn(async () => {
        if (result instanceof Error) throw result;
        return result;
      });
      vi.stubGlobal('fetch', fetch);
      const service = new LinkPreviewService(cache);
      service.setEndpoint(endpoint);

      await expect(service.query(item().content.url!)).resolves.toEqual({});
      expect(fetch).toHaveBeenCalledTimes(endpoint ? 1 : 0);
    }
  );

  test.each([
    [
      'self-hosted route',
      workspace('self'),
      [
        server(
          'self',
          'https://self.example/',
          ServerDeploymentType.Selfhosted
        ),
      ],
      'https://self.example/api/worker/link-preview',
    ],
    [
      'cloud route',
      workspace('cloud'),
      [server('cloud', 'https://cloud.example/', ServerDeploymentType.Affine)],
      'https://cloud.example/api/worker/link-preview',
    ],
    ['local deferred route', workspace('local'), [], undefined],
    ['missing server', workspace('missing'), [], undefined],
    [
      'server with unknown config',
      workspace('unknown'),
      [server('unknown', 'https://unknown.example/')],
      undefined,
    ],
  ])('selects the %s', (_name, target, servers, endpoint) => {
    const owner = new SharePreviewRouteOwner(item());
    owner.selectWorkspace(target, servers);
    expect(owner.routeEndpoint).toBe(endpoint);
  });

  test('uses the current selected workspace server and deduplicates active requests', async () => {
    let resolve!: (response: Response) => void;
    const fetch = vi.fn<typeof globalThis.fetch>(
      () =>
        new Promise<Response>(done => {
          resolve = done;
        })
    );
    vi.stubGlobal('fetch', fetch);
    const owner = new SharePreviewRouteOwner(item());
    const selected = workspace('self');
    owner.selectWorkspace(selected, [
      server('self', 'https://first.example/', ServerDeploymentType.Selfhosted),
    ]);
    owner.selectWorkspace(selected, [
      server(
        'self',
        'https://changed.example/',
        ServerDeploymentType.Selfhosted
      ),
    ]);

    const first = owner.load()!;
    expect(owner.load()).toBe(first);
    expect(fetch.mock.calls[0]?.[1]?.headers).toEqual({
      'Content-Type': 'application/json',
    });
    expect(owner.routeEndpoint).toBe(
      'https://changed.example/api/worker/link-preview'
    );
    resolve(
      new Response(
        JSON.stringify({
          url: item().content.url,
          title: 42,
          images: ['https://example.com/image.jpg', 42],
          transcript: { segments: 'invalid' },
        }),
        { status: 200 }
      )
    );
    await expect(first).resolves.toEqual({
      url: item().content.url,
      images: ['https://example.com/image.jpg'],
    });
    fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ url: item().content.url }), { status: 200 })
    );
    await owner.load();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('invalidates an active request when the selected endpoint changes', () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      () => new Promise<Response>(() => {})
    );
    vi.stubGlobal('fetch', fetch);
    const owner = new SharePreviewRouteOwner(item());
    owner.selectWorkspace(workspace('self'), [
      server('self', 'https://self.example/', ServerDeploymentType.Selfhosted),
    ]);
    const first = owner.load();
    owner.selectWorkspace(workspace('cloud'), [
      server('cloud', 'https://cloud.example/', ServerDeploymentType.Affine),
    ]);
    const second = owner.load();

    expect(second).not.toBe(first);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      '/api/worker/link-preview',
      '/api/worker/link-preview',
    ]);
  });

  test('uses the replacement server instead of a cached preview for the same workspace', async () => {
    const selectedWorkspace = workspace('self');
    const firstServer = server(
      'self',
      'https://first.example/',
      ServerDeploymentType.Selfhosted
    );
    Object.assign(firstServer, {
      fetch: vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ url: item().content.url, title: 'Preview A' }),
            { status: 200 }
          )
        ),
    });
    let resolveSecond!: (response: Response) => void;
    const secondFetch = vi.fn(
      () =>
        new Promise<Response>(resolve => {
          resolveSecond = resolve;
        })
    );
    const replacementServer = server(
      'self',
      'https://second.example/',
      ServerDeploymentType.Selfhosted
    );
    Object.assign(replacementServer, { fetch: secondFetch });
    const owner = new SharePreviewRouteOwner(item());
    owner.selectWorkspace(selectedWorkspace, [firstServer]);
    const previewA = await owner.load();
    const cached = {
      itemId: item().id,
      workspaceKey: 'self:workspace',
      generation: owner.generation,
      value: previewA!,
    };

    owner.selectWorkspace(selectedWorkspace, [replacementServer]);
    const preview = previewForImport(item(), selectedWorkspace, cached, owner, [
      replacementServer,
    ]);

    expect(secondFetch).toHaveBeenCalledWith(
      '/api/worker/link-preview',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    resolveSecond(
      new Response(
        JSON.stringify({ url: item().content.url, title: 'Preview B' }),
        { status: 200 }
      )
    );
    await expect(preview).resolves.toMatchObject({ title: 'Preview B' });
  });

  test('keeps the generation stable for the exact same selected route', () => {
    const selectedWorkspace = workspace('self');
    const selectedServer = server(
      'self',
      'https://self.example/',
      ServerDeploymentType.Selfhosted
    );
    const owner = new SharePreviewRouteOwner(item());

    owner.selectWorkspace(selectedWorkspace, [selectedServer]);
    const generation = owner.generation;
    owner.selectWorkspace(selectedWorkspace, [selectedServer]);

    expect(owner.generation).toBe(generation);
  });

  test('rejects a late response after its workspace generation is replaced', async () => {
    let resolveFirst!: (response: Response) => void;
    const firstServer = server(
      'first',
      'https://first.example/',
      ServerDeploymentType.Selfhosted
    );
    Object.assign(firstServer, {
      fetch: vi.fn(
        () =>
          new Promise<Response>(resolve => {
            resolveFirst = resolve;
          })
      ),
    });
    const owner = new SharePreviewRouteOwner(item());
    owner.selectWorkspace(workspace('first'), [firstServer]);
    const first = owner.load()!;

    owner.selectWorkspace(workspace('local'), []);
    resolveFirst(
      new Response(JSON.stringify({ url: item().content.url }), { status: 200 })
    );

    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('does not reuse an aborted request', async () => {
    const responses: ((response: Response) => void)[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_input, init) =>
        new Promise<Response>((resolve, reject) => {
          responses.push(resolve);
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true }
          );
        })
    );
    vi.stubGlobal('fetch', fetch);
    const owner = new SharePreviewRouteOwner(item());
    owner.selectWorkspace(workspace('cloud'), [
      server('cloud', 'https://app.affine.pro/', ServerDeploymentType.Affine),
    ]);
    const controller = new AbortController();
    const first = owner.load(controller.signal)!;

    controller.abort();
    const second = owner.load()!;

    expect(second).not.toBe(first);
    expect(fetch).toHaveBeenCalledTimes(2);
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    responses[1]?.(
      new Response(JSON.stringify({ url: item().content.url }), { status: 200 })
    );
    await expect(second).resolves.toMatchObject({ url: item().content.url });
  });

  test('treats a legacy missing route as deferred until workspace selection', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: item().content.url }), {
        status: 200,
      })
    );
    vi.stubGlobal('fetch', fetch);
    const owner = new SharePreviewRouteOwner(item());

    owner.selectWorkspace(undefined, []);
    expect(owner.routeEndpoint).toBeUndefined();
    expect(owner.load()).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();

    owner.selectWorkspace(workspace('cloud'), [
      server('cloud', 'https://cloud.example/', ServerDeploymentType.Affine),
    ]);
    expect(owner.routeEndpoint).toBe(
      'https://cloud.example/api/worker/link-preview'
    );
    await owner.load();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test.each([
    [
      'self-hosted configuration without an account',
      [
        server(
          'self',
          'https://self.example/',
          ServerDeploymentType.Selfhosted
        ),
      ],
      true,
      'selfHostedPresent',
    ],
    [
      'configuration still loading',
      [server('unknown', 'https://unknown.example/')],
      true,
      'unknown',
    ],
    [
      'signed-in cloud configuration',
      [server('cloud', 'https://cloud.example/', ServerDeploymentType.Affine)],
      true,
      'cloudOnly',
    ],
    ['signed-out cloud configuration', [], false, 'signedOut'],
  ])('resolves %s safely', (_name, servers, signedIn, mode) => {
    expect(resolveShareWorkspaceMode(servers, signedIn)).toBe(mode);
  });
});

describe('structured share-preview writer', () => {
  test('fetches fresh server config exactly once without mutating cached state', async () => {
    const config = {
      features: [ServerFeature.SharePreviewBlobRefs],
    };
    const fetchServerConfig = vi.fn().mockResolvedValue(config);
    const method = (
      Server.prototype as unknown as {
        fetchFreshConfig(
          this: unknown,
          signal: AbortSignal
        ): Promise<typeof config>;
      }
    ).fetchFreshConfig;
    expect(method).toBeTypeOf('function');
    const signal = new AbortController().signal;

    await expect(
      method.call(
        {
          baseUrl: 'https://self.example/',
          serverConfigStore: { fetchServerConfig },
        },
        signal
      )
    ).resolves.toBe(config);
    expect(fetchServerConfig).toHaveBeenCalledTimes(1);
    expect(fetchServerConfig).toHaveBeenCalledWith(
      'https://self.example/',
      signal
    );
  });

  test('propagates strict fresh-config failures', async () => {
    const failure = new DOMException('Aborted', 'AbortError');
    const fetchServerConfig = vi.fn().mockRejectedValue(failure);
    const method = (
      Server.prototype as unknown as {
        fetchFreshConfig(this: unknown, signal: AbortSignal): Promise<unknown>;
      }
    ).fetchFreshConfig;
    expect(method).toBeTypeOf('function');

    await expect(
      method.call(
        {
          baseUrl: 'https://self.example/',
          serverConfigStore: { fetchServerConfig },
        },
        new AbortController().signal
      )
    ).rejects.toBe(failure);
    expect(fetchServerConfig).toHaveBeenCalledTimes(1);
  });

  test.each([
    [
      'ordinary page',
      {
        url: 'https://example.com/article',
        title: 'Article title',
        description: 'Article description',
        images: ['https://example.com/image.png'],
      },
      {
        version: 1,
        sourceUrl: 'https://example.com/article',
        title: 'Article title',
        description: 'Article description',
        image: 'https://example.com/image.png',
      },
    ],
    [
      'YouTube',
      {
        url: 'https://youtube.com/watch?v=123',
        title: 'Video title',
        provider: 'youtube' as const,
        durationSeconds: 90,
        transcript: {
          language: 'en',
          segments: [{ text: 'Welcome', startSeconds: 1 }],
        },
      },
      {
        version: 1,
        sourceUrl: 'https://youtube.com/watch?v=123',
        title: 'Video title',
        provider: 'youtube',
        durationSeconds: 90,
        transcript: {
          language: 'en',
          segments: [{ text: 'Welcome', startSeconds: 1 }],
        },
      },
    ],
    [
      'X',
      {
        url: 'https://x.com/affine/status/123',
        title: 'Post title',
        description: 'Post body',
        provider: 'x' as const,
      },
      {
        version: 1,
        sourceUrl: 'https://x.com/affine/status/123',
        title: 'Post title',
        description: 'Post body',
        provider: 'x',
      },
    ],
  ])(
    'writes one validated content-addressed record for an %s',
    async (_name, response, expectedRecord) => {
      const selectedServer = routedPreviewServer({
        preview: response,
        freshConfig: async () => ({
          features: [ServerFeature.SharePreviewBlobRefs],
        }),
      });
      const routed = await loadRoutedPreview(response, selectedServer);
      const harness = makeShareWriterHarness();

      await expect(
        harness.service.importShareToWorkspace(
          harness.metadata,
          writerInput(routed.preview),
          { allowOffline: true }
        )
      ).resolves.toEqual({ status: 'imported', docId: 'doc' });

      expect((selectedServer as any).fetchFreshConfig).toHaveBeenCalledTimes(1);
      expect(harness.blobSet).toHaveBeenCalledTimes(1);
      const detailsBlob = harness.blobSet.mock.calls[0][0];
      await expect(parseSharePreviewBlob(detailsBlob)).resolves.toEqual(
        expectedRecord
      );
      expect(
        harness.models.get(shareImportBlockIds('attempt').bookmark)?.props
      ).toMatchObject({
        sharePreviewSourceId: 'details-content-hash',
        sharePreviewVersion: 1,
      });
    }
  );

  test.each([
    ['fresh fetch fails', async () => Promise.reject(new Error('offline'))],
    ['fresh response omits capability', async () => ({ features: [] })],
  ])('ignores cached capability when %s', async (_name, freshConfig) => {
    const response = {
      url: 'https://example.com/article',
      title: 'Freshness protected',
    };
    const selectedServer = routedPreviewServer({
      preview: response,
      freshConfig,
    });
    const routed = await loadRoutedPreview(response, selectedServer);
    const harness = makeShareWriterHarness();

    await harness.service.importShareToWorkspace(
      harness.metadata,
      writerInput(routed.preview),
      { allowOffline: true }
    );

    expect((selectedServer as any).fetchFreshConfig).toHaveBeenCalledTimes(1);
    expect(harness.blobSet).not.toHaveBeenCalled();
    expect(
      harness.models.get(shareImportBlockIds('attempt').bookmark)?.props
    ).not.toHaveProperty('sharePreviewSourceId');
  });

  test('aborts a half-open strict config request and saves an ordinary bookmark', async () => {
    const freshConfig = vi.fn(
      (signal: AbortSignal) =>
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true }
          );
        })
    );
    const response = {
      url: 'https://example.com/half-open',
      title: 'Bounded authorization',
    };
    const selectedServer = routedPreviewServer({
      preview: response,
      freshConfig,
    });
    const routed = await loadRoutedPreview(response, selectedServer);
    const harness = makeShareWriterHarness();
    const importing = harness.service.importShareToWorkspace(
      harness.metadata,
      writerInput(routed.preview),
      { allowOffline: true }
    );

    await expect(withTestDeadline(importing)).resolves.toEqual({
      status: 'imported',
      docId: 'doc',
    });
    expect(freshConfig).toHaveBeenCalledTimes(1);
    expect(freshConfig.mock.calls[0][0].aborted).toBe(true);
    expect(harness.blobSet).not.toHaveBeenCalled();
    expect(
      harness.models.get(shareImportBlockIds('attempt').bookmark)?.props
    ).not.toHaveProperty('sharePreviewSourceId');
  });

  test('times out an authorization callback that ignores abort forever', async () => {
    const freshConfig = vi.fn(
      (_signal: AbortSignal) => new Promise<never>(() => {})
    );
    const response = {
      url: 'https://example.com/ignores-abort',
      title: 'Ignored abort',
    };
    const selectedServer = routedPreviewServer({
      preview: response,
      freshConfig,
    });
    const routed = await loadRoutedPreview(response, selectedServer);
    const harness = makeShareWriterHarness();

    await expect(
      withTestDeadline(
        harness.service.importShareToWorkspace(
          harness.metadata,
          writerInput(routed.preview),
          { allowOffline: true }
        )
      )
    ).resolves.toEqual({ status: 'imported', docId: 'doc' });
    expect(freshConfig).toHaveBeenCalledTimes(1);
    expect(freshConfig.mock.calls[0][0].aborted).toBe(true);
    expect(harness.blobSet).not.toHaveBeenCalled();
    expect(
      harness.models.get(shareImportBlockIds('attempt').bookmark)?.props
    ).not.toHaveProperty('sharePreviewSourceId');
  });

  test('rejects an authorization result that resolves true after abort', async () => {
    const freshConfig = vi.fn(
      (signal: AbortSignal) =>
        new Promise(resolve => {
          signal.addEventListener(
            'abort',
            () => resolve({ features: [ServerFeature.SharePreviewBlobRefs] }),
            { once: true }
          );
        })
    );
    const response = {
      url: 'https://example.com/late-authorization',
      title: 'Late authorization',
    };
    const selectedServer = routedPreviewServer({
      preview: response,
      freshConfig,
    });
    const routed = await loadRoutedPreview(response, selectedServer);
    const harness = makeShareWriterHarness();

    await expect(
      withTestDeadline(
        harness.service.importShareToWorkspace(
          harness.metadata,
          writerInput(routed.preview),
          { allowOffline: true }
        )
      )
    ).resolves.toEqual({ status: 'imported', docId: 'doc' });
    expect(freshConfig).toHaveBeenCalledTimes(1);
    expect(freshConfig.mock.calls[0][0].aborted).toBe(true);
    expect(harness.blobSet).not.toHaveBeenCalled();
    expect(
      harness.models.get(shareImportBlockIds('attempt').bookmark)?.props
    ).not.toHaveProperty('sharePreviewSourceId');
  });

  test('does not store details when the stable bookmark appears during authorization', async () => {
    let resolveConfig!: (value: unknown) => void;
    const freshConfig = vi.fn(
      () =>
        new Promise(resolve => {
          resolveConfig = resolve;
        })
    );
    const response = {
      url: 'https://example.com/replay-race',
      title: 'Incoming title',
    };
    const selectedServer = routedPreviewServer({
      preview: response,
      freshConfig,
    });
    const routed = await loadRoutedPreview(response, selectedServer);
    const harness = makeShareWriterHarness();
    const ids = shareImportBlockIds('attempt');
    const importing = harness.service.importShareToWorkspace(
      harness.metadata,
      writerInput(routed.preview),
      { allowOffline: true }
    );
    await vi.waitFor(() => expect(freshConfig).toHaveBeenCalledTimes(1));

    harness.models.set(ids.bookmark, {
      id: ids.bookmark,
      flavour: 'affine:bookmark',
      parent: { id: ids.note },
      props: {
        url: 'https://user-edited.example',
        title: 'Existing bookmark',
      },
    });
    resolveConfig({ features: [ServerFeature.SharePreviewBlobRefs] });

    await expect(importing).resolves.toEqual({
      status: 'imported',
      docId: 'doc',
    });
    expect(harness.blobSet).not.toHaveBeenCalled();
    expect(harness.models.get(ids.bookmark)?.props).toEqual({
      url: 'https://user-edited.example',
      title: 'Existing bookmark',
    });
  });

  test.each([
    ['wrong flavour', 'affine:paragraph', 'note'],
    ['wrong parent', 'affine:bookmark', 'page'],
  ])(
    'returns a conflict when a stable bookmark with the %s arrives during authorization',
    async (_name, flavour, parent) => {
      let resolveConfig!: (value: unknown) => void;
      const freshConfig = vi.fn(
        () =>
          new Promise(resolve => {
            resolveConfig = resolve;
          })
      );
      const response = {
        url: 'https://example.com/invalid-replay-race',
        title: 'Incoming title',
      };
      const selectedServer = routedPreviewServer({
        preview: response,
        freshConfig,
      });
      const routed = await loadRoutedPreview(response, selectedServer);
      const harness = makeShareWriterHarness();
      const ids = shareImportBlockIds('attempt');
      const importing = harness.service.importShareToWorkspace(
        harness.metadata,
        writerInput(routed.preview),
        { allowOffline: true }
      );
      await vi.waitFor(() => expect(freshConfig).toHaveBeenCalledTimes(1));

      harness.models.set(ids.bookmark, {
        id: ids.bookmark,
        flavour,
        parent: { id: parent === 'note' ? ids.note : ids.page },
        props: { title: 'Invalid synced block' },
      });
      resolveConfig({ features: [ServerFeature.SharePreviewBlobRefs] });

      await expect(importing).resolves.toEqual({ status: 'import-conflict' });
      expect(harness.blobSet).not.toHaveBeenCalled();
      expect(harness.docs.setCustomPropertyById).toHaveBeenCalledTimes(1);
    }
  );

  test.each([
    ['note wrong flavour', 'note', 'affine:paragraph', 'page'],
    ['note wrong parent', 'note', 'affine:note', 'surface'],
    ['surface wrong flavour', 'surface', 'affine:paragraph', 'page'],
    ['surface wrong parent', 'surface', 'affine:surface', 'note'],
  ])(
    'returns a conflict when the stable %s invariant changes during authorization',
    async (_name, target, flavour, parent) => {
      let resolveConfig!: (value: unknown) => void;
      const freshConfig = vi.fn(
        () =>
          new Promise(resolve => {
            resolveConfig = resolve;
          })
      );
      const response = {
        url: 'https://example.com/skeleton-authorization-race',
        title: 'Skeleton authorization race',
      };
      const selectedServer = routedPreviewServer({
        preview: response,
        freshConfig,
      });
      const routed = await loadRoutedPreview(response, selectedServer);
      const harness = makeShareWriterHarness();
      const ids = shareImportBlockIds('attempt');
      const importing = harness.service.importShareToWorkspace(
        harness.metadata,
        writerInput(routed.preview),
        { allowOffline: true }
      );
      await vi.waitFor(() => expect(freshConfig).toHaveBeenCalledTimes(1));

      const model = harness.models.get(
        target === 'note' ? ids.note : ids.surface
      )!;
      model.flavour = flavour;
      model.parent = {
        id:
          parent === 'page'
            ? ids.page
            : parent === 'surface'
              ? ids.surface
              : ids.note,
      };
      resolveConfig({ features: [ServerFeature.SharePreviewBlobRefs] });

      await expect(importing).resolves.toEqual({ status: 'import-conflict' });
      expect(harness.blobSet).not.toHaveBeenCalled();
      expect(harness.docs.setCustomPropertyById).toHaveBeenCalledTimes(1);
    }
  );

  test('returns a conflict when the stable plan becomes invalid during Blob storage', async () => {
    const response = {
      url: 'https://example.com/storage-conflict',
      title: 'Storage conflict',
    };
    const selectedServer = routedPreviewServer({
      preview: response,
      freshConfig: async () => ({
        features: [ServerFeature.SharePreviewBlobRefs],
      }),
    });
    const routed = await loadRoutedPreview(response, selectedServer);
    const harness = makeShareWriterHarness();
    const ids = shareImportBlockIds('attempt');
    let resolveBlob!: (sourceId: string) => void;
    harness.blobSet.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveBlob = resolve;
        })
    );
    const importing = harness.service.importShareToWorkspace(
      harness.metadata,
      writerInput(routed.preview),
      { allowOffline: true }
    );
    await vi.waitFor(() => expect(harness.blobSet).toHaveBeenCalledTimes(1));

    harness.models.set(ids.bookmark, {
      id: ids.bookmark,
      flavour: 'affine:paragraph',
      parent: { id: ids.note },
      props: { text: 'Invalid synced block' },
    });
    resolveBlob('details-content-hash');

    await expect(importing).resolves.toEqual({ status: 'import-conflict' });
    expect(harness.docs.setCustomPropertyById).toHaveBeenCalledTimes(1);
    expect(harness.models.get(ids.bookmark)?.props).toEqual({
      text: 'Invalid synced block',
    });
  });

  test('returns a conflict when the stable skeleton changes during Blob storage', async () => {
    const response = {
      url: 'https://example.com/skeleton-storage-conflict',
      title: 'Skeleton storage conflict',
    };
    const selectedServer = routedPreviewServer({
      preview: response,
      freshConfig: async () => ({
        features: [ServerFeature.SharePreviewBlobRefs],
      }),
    });
    const routed = await loadRoutedPreview(response, selectedServer);
    const harness = makeShareWriterHarness();
    const ids = shareImportBlockIds('attempt');
    let resolveBlob!: (sourceId: string) => void;
    harness.blobSet.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveBlob = resolve;
        })
    );
    const importing = harness.service.importShareToWorkspace(
      harness.metadata,
      writerInput(routed.preview),
      { allowOffline: true }
    );
    await vi.waitFor(() => expect(harness.blobSet).toHaveBeenCalledTimes(1));

    harness.models.get(ids.note)!.parent = { id: ids.surface };
    resolveBlob('details-content-hash');

    await expect(importing).resolves.toEqual({ status: 'import-conflict' });
    expect(harness.blobSet).toHaveBeenCalledTimes(1);
    expect(harness.docs.setCustomPropertyById).toHaveBeenCalledTimes(1);
  });

  test('preserves a valid bookmark that arrives during Blob storage', async () => {
    const response = {
      url: 'https://example.com/storage-replay',
      title: 'Storage replay',
    };
    const selectedServer = routedPreviewServer({
      preview: response,
      freshConfig: async () => ({
        features: [ServerFeature.SharePreviewBlobRefs],
      }),
    });
    const routed = await loadRoutedPreview(response, selectedServer);
    const harness = makeShareWriterHarness();
    const ids = shareImportBlockIds('attempt');
    let resolveBlob!: (sourceId: string) => void;
    harness.blobSet.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveBlob = resolve;
        })
    );
    const importing = harness.service.importShareToWorkspace(
      harness.metadata,
      writerInput(routed.preview),
      { allowOffline: true }
    );
    await vi.waitFor(() => expect(harness.blobSet).toHaveBeenCalledTimes(1));

    harness.models.set(ids.bookmark, {
      id: ids.bookmark,
      flavour: 'affine:bookmark',
      parent: { id: ids.note },
      props: {
        url: 'https://user-edited.example',
        title: 'Existing bookmark',
      },
    });
    resolveBlob('details-content-hash');

    await expect(importing).resolves.toEqual({
      status: 'imported',
      docId: 'doc',
    });
    expect(harness.models.get(ids.bookmark)?.props).toEqual({
      url: 'https://user-edited.example',
      title: 'Existing bookmark',
    });
    expect(harness.docs.setCustomPropertyById).toHaveBeenCalledTimes(2);
  });

  test('fails closed when the selected server changes during the strict fetch', async () => {
    let resolveConfig!: (value: unknown) => void;
    const freshConfig = vi.fn(
      () =>
        new Promise(resolve => {
          resolveConfig = resolve;
        })
    );
    const response = {
      url: 'https://example.com/article',
      title: 'Generation protected',
    };
    const selectedServer = routedPreviewServer({
      preview: response,
      freshConfig,
    });
    const routed = await loadRoutedPreview(response, selectedServer);
    const harness = makeShareWriterHarness();
    const importing = harness.service.importShareToWorkspace(
      harness.metadata,
      writerInput(routed.preview),
      { allowOffline: true }
    );
    await vi.waitFor(() => expect(freshConfig).toHaveBeenCalledTimes(1));

    routed.owner.selectWorkspace(workspace('other'), [
      server('other', 'https://old.example/'),
    ]);
    resolveConfig({ features: [ServerFeature.SharePreviewBlobRefs] });

    await expect(importing).resolves.toEqual({
      status: 'imported',
      docId: 'doc',
    });
    expect(harness.blobSet).not.toHaveBeenCalled();
    expect(
      harness.models.get(shareImportBlockIds('attempt').bookmark)?.props
    ).not.toHaveProperty('sharePreviewSourceId');
  });

  test('keeps the production Gate C default dormant', async () => {
    const response = {
      url: 'https://example.com/article',
      title: 'Dormant writer',
    };
    const selectedServer = routedPreviewServer({
      preview: response,
      freshConfig: async () => ({
        features: [ServerFeature.SharePreviewBlobRefs],
      }),
    });
    const pending = {
      ...item(),
      content: { kind: 'url', url: response.url },
    } as PendingShareItem;
    const owner = new SharePreviewRouteOwner(pending);
    owner.selectWorkspace(workspace('self'), [selectedServer]);
    const preview = await owner.load();
    const harness = makeShareWriterHarness();

    await harness.service.importShareToWorkspace(
      harness.metadata,
      writerInput(preview),
      { allowOffline: true }
    );

    expect((selectedServer as any).fetchFreshConfig).not.toHaveBeenCalled();
    expect(harness.blobSet).not.toHaveBeenCalled();
  });

  test('does not authorize, write, or mutate an existing stable bookmark on replay', async () => {
    const ids = shareImportBlockIds('attempt');
    const authorizeDetailsWrite = vi.fn(async () => true);
    const harness = makeShareWriterHarness({
      receipt: JSON.stringify({
        version: 1,
        attemptId: 'attempt',
        state: 'preparing',
      }),
      recordExists: true,
      blocks: [
        { id: ids.page, flavour: 'affine:page' },
        { id: ids.surface, flavour: 'affine:surface', parentId: ids.page },
        { id: ids.note, flavour: 'affine:note', parentId: ids.page },
        {
          id: ids.bookmark,
          flavour: 'affine:bookmark',
          parentId: ids.note,
          props: { url: 'https://user-edited.example', title: 'User title' },
        },
      ],
    });
    const preview = {
      url: 'https://example.com/article',
      title: 'Incoming title',
      authorizeDetailsWrite,
    } as ShareLinkPreview;

    await harness.service.importShareToWorkspace(
      harness.metadata,
      writerInput(preview),
      { allowOffline: true }
    );

    expect(authorizeDetailsWrite).not.toHaveBeenCalled();
    expect(harness.blobSet).not.toHaveBeenCalled();
    expect(harness.models.get(ids.bookmark)?.props).toEqual({
      url: 'https://user-edited.example',
      title: 'User title',
    });
  });

  test('returns a committed replay without touching user-edited stable content', async () => {
    const ids = shareImportBlockIds('attempt');
    const harness = makeShareWriterHarness({
      receipt: JSON.stringify({
        version: 1,
        attemptId: 'attempt',
        state: 'committed',
      }),
      recordExists: true,
      blocks: [
        { id: ids.page, flavour: 'affine:page' },
        { id: ids.surface, flavour: 'affine:surface', parentId: ids.page },
        { id: ids.note, flavour: 'affine:note', parentId: ids.page },
        {
          id: ids.bookmark,
          flavour: 'affine:bookmark',
          parentId: ids.note,
          props: { url: 'https://user-edited.example', title: 'User title' },
        },
      ],
    });

    await expect(
      harness.service.importShareToWorkspace(
        harness.metadata,
        writerInput({
          url: 'https://example.com/article',
          title: 'Incoming title',
        }),
        { allowOffline: true }
      )
    ).resolves.toEqual({ status: 'committed-replay', docId: 'doc' });

    expect(harness.docs.open).not.toHaveBeenCalled();
    expect(harness.blobSet).not.toHaveBeenCalled();
    expect(harness.models.get(ids.bookmark)?.props).toEqual({
      url: 'https://user-edited.example',
      title: 'User title',
    });
  });

  test.each([
    [
      'invalid data',
      {
        url: 'https://example.com/article',
        title: 'Invalid image',
        images: ['not-a-url'],
      },
    ],
    [
      'oversized data',
      {
        url: 'https://example.com/article',
        title: 'Oversized description',
        description: 'x'.repeat(256 * 1024),
      },
    ],
  ])(
    'degrades %s to an ordinary bookmark before authorization',
    async (_name, response) => {
      const selectedServer = routedPreviewServer({
        preview: response,
        freshConfig: async () => ({
          features: [ServerFeature.SharePreviewBlobRefs],
        }),
      });
      const routed = await loadRoutedPreview(response, selectedServer);
      const harness = makeShareWriterHarness();

      await harness.service.importShareToWorkspace(
        harness.metadata,
        writerInput(routed.preview),
        { allowOffline: true }
      );

      expect((selectedServer as any).fetchFreshConfig).not.toHaveBeenCalled();
      expect(harness.blobSet).not.toHaveBeenCalled();
      expect(
        harness.models.get(shareImportBlockIds('attempt').bookmark)?.props
      ).not.toHaveProperty('sharePreviewSourceId');
    }
  );

  test('keeps local and unrouted previews as ordinary titled bookmarks', async () => {
    const harness = makeShareWriterHarness();
    const preview = {
      url: 'https://example.com/article',
      title: 'Unrouted preview',
    };

    await harness.service.importShareToWorkspace(
      harness.metadata,
      writerInput(preview),
      { allowOffline: true }
    );

    expect(harness.blobSet).not.toHaveBeenCalled();
    expect(
      harness.models.get(shareImportBlockIds('attempt').bookmark)?.props
    ).toMatchObject({ title: 'Unrouted preview' });
  });

  test('keeps a new writer reference live in the minimum compatible reader and unused-blob collector', async () => {
    const response = {
      url: 'https://example.com/mixed-version',
      title: 'Mixed version',
    };
    const selectedServer = routedPreviewServer({
      preview: response,
      freshConfig: async () => ({
        features: [ServerFeature.SharePreviewBlobRefs],
      }),
    });
    const routed = await loadRoutedPreview(response, selectedServer);
    const harness = makeShareWriterHarness();
    await harness.service.importShareToWorkspace(
      harness.metadata,
      writerInput(routed.preview),
      { allowOffline: true }
    );
    const bookmarkProps = harness.models.get(
      shareImportBlockIds('attempt').bookmark
    )?.props;
    const sourceId = bookmarkProps?.sharePreviewSourceId as string;

    const doc = new YDoc({ guid: 'mixed-version-doc' });
    const blocks = doc.getMap('blocks');
    const page = new YMap();
    page.set('sys:id', 'page');
    page.set('sys:flavour', 'affine:page');
    page.set('sys:children', YArray.from(['note']));
    page.set('prop:title', new YText('Page'));
    blocks.set('page', page);
    const note = new YMap();
    note.set('sys:id', 'note');
    note.set('sys:flavour', 'affine:note');
    note.set('sys:children', YArray.from(['bookmark']));
    note.set('prop:displayMode', 'page');
    blocks.set('note', note);
    const bookmark = new YMap();
    bookmark.set('sys:id', 'bookmark');
    bookmark.set('sys:flavour', 'affine:bookmark');
    bookmark.set('sys:children', new YArray());
    bookmark.set('prop:url', response.url);
    bookmark.set('prop:title', response.title);
    bookmark.set('prop:sharePreviewSourceId', sourceId);
    bookmark.set('prop:sharePreviewVersion', 1);
    blocks.set('bookmark', bookmark);

    const indexed = await readAllBlocksFromDoc({
      ydoc: doc,
      spaceId: 'minimum-compatible-reader',
    });
    const indexedBlobIds =
      indexed?.blocks.flatMap(block => block.blob ?? []) ?? [];
    expect(indexedBlobIds).toContain('details-content-hash');

    const framework = new Framework();
    framework
      .service(WorkspaceFlavoursService, {
        flavours$: {
          value: [
            {
              flavour: 'local',
              listBlobs: vi
                .fn()
                .mockResolvedValue([{ key: 'details-content-hash' }]),
            },
          ],
        },
      } as unknown as WorkspaceFlavoursService)
      .service(WorkspaceService, {
        workspace: {
          id: 'workspace',
          flavour: 'local',
          avatar$: { value: null },
          engine: { doc: { waitForSynced: vi.fn() } },
        },
      } as unknown as WorkspaceService)
      .service(DocsSearchService, {
        indexer: {
          waitForCompleted: vi.fn(),
          aggregate: vi.fn().mockResolvedValue({
            pagination: { hasMore: false },
            buckets: indexedBlobIds.map(key => ({ key })),
          }),
        },
      } as unknown as DocsSearchService)
      .entity(UnusedBlobs, [
        WorkspaceFlavoursService,
        WorkspaceService,
        DocsSearchService,
      ]);

    await expect(
      framework.provider().createEntity(UnusedBlobs).getUnusedBlobs()
    ).resolves.toEqual([]);
  });
});

describe('share destination selection lifecycle', () => {
  test.each(['imported', 'committed-replay'] as const)(
    'completes the native item after an %s result',
    async status => {
      const selectedWorkspace = workspace('local');
      const pending = {
        ...item(),
        target: {
          workspaceId: selectedWorkspace.id,
          workspaceFlavour: selectedWorkspace.flavour,
          tagIds: [],
        },
      } satisfies PendingShareItem;
      let completed = false;
      const importer = {
        getShareDestinationOptions: vi.fn().mockResolvedValue({
          verification: 'confirmed',
          tags: [],
          collections: [],
        }),
        importShareToWorkspace: vi
          .fn()
          .mockResolvedValue({ status, docId: pending.documentId }),
      };
      controllerServiceMocks.services.set(WorkspacesService.name, {
        list: { workspaces$: { value: [selectedWorkspace] } },
        getProfile: () => ({ name$: { value: 'Local workspace' } }),
      });
      controllerServiceMocks.services.set(ServersService.name, {
        serversWithAccount$: { value: [] },
        servers$: { value: [] },
      });
      controllerServiceMocks.services.set(ImportClipperService.name, importer);
      const provider = {
        updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
        listPending: vi.fn(async () =>
          completed ? [] : [{ status: 'ready' as const, item: pending }]
        ),
        updateTarget: vi.fn().mockResolvedValue(undefined),
        resolveAttachment: vi.fn().mockResolvedValue(undefined),
        complete: vi.fn().mockImplementation(async () => {
          completed = true;
        }),
        setError: vi.fn().mockResolvedValue(undefined),
      };

      render(<ShareImportController provider={provider} />);

      await waitFor(() =>
        expect(provider.complete).toHaveBeenCalledWith(
          pending.id,
          pending.documentId
        )
      );
      expect(provider.setError).not.toHaveBeenCalled();
    }
  );

  test.each([
    'attachment-missing',
    'permission-denied',
    'destination-not-found',
    'offline-confirmation-required',
    'import-conflict',
  ] as const)('does not complete a native item after %s', async status => {
    const selectedWorkspace = workspace('local');
    const pending = {
      ...item(),
      target: {
        workspaceId: selectedWorkspace.id,
        workspaceFlavour: selectedWorkspace.flavour,
        tagIds: [],
      },
    } satisfies PendingShareItem;
    const importer = {
      getShareDestinationOptions: vi.fn().mockResolvedValue({
        verification: 'confirmed',
        tags: [],
        collections: [],
      }),
      importShareToWorkspace: vi.fn().mockResolvedValue({ status }),
    };
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [selectedWorkspace] } },
      getProfile: () => ({ name$: { value: 'Local workspace' } }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, importer);
    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi
        .fn()
        .mockResolvedValue([{ status: 'ready' as const, item: pending }]),
      updateTarget: vi.fn().mockResolvedValue(undefined),
      resolveAttachment: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockResolvedValue(undefined),
      setError: vi.fn().mockResolvedValue(undefined),
    };

    render(<ShareImportController provider={provider} />);

    await waitFor(() =>
      expect(provider.setError).toHaveBeenCalledWith(pending.id, status)
    );
    expect(provider.complete).not.toHaveBeenCalled();
    expect(importer.importShareToWorkspace).toHaveBeenCalledTimes(1);
  });

  test('shows one local recovery error without retrying completion in the same refresh', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const selectedWorkspace = workspace('local');
    const pending = {
      ...item(),
      target: {
        workspaceId: selectedWorkspace.id,
        workspaceFlavour: selectedWorkspace.flavour,
        tagIds: [],
      },
    } satisfies PendingShareItem;
    const importer = {
      getShareDestinationOptions: vi.fn().mockResolvedValue({
        verification: 'confirmed',
        tags: [],
        collections: [],
      }),
      importShareToWorkspace: vi
        .fn()
        .mockResolvedValue({ status: 'imported', docId: pending.documentId }),
    };
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [selectedWorkspace] } },
      getProfile: () => ({ name$: { value: 'Local workspace' } }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, importer);
    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi
        .fn()
        .mockResolvedValue([{ status: 'ready' as const, item: pending }]),
      updateTarget: vi.fn().mockResolvedValue(undefined),
      resolveAttachment: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockRejectedValue(new Error('cleanup failed')),
      setError: vi.fn().mockResolvedValue(undefined),
    };

    render(<ShareImportController provider={provider} />);

    await screen.findByText(
      'This share was saved, but AFFiNE could not clear it from the inbox. Try again.'
    );
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(importer.importShareToWorkspace).toHaveBeenCalledTimes(1);
    expect(provider.complete).toHaveBeenCalledTimes(1);
    expect(provider.setError).not.toHaveBeenCalledWith(
      pending.id,
      'completion-failed'
    );
  });

  test('clears a completion-failed item when native cleanup hides its result marker', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const notifySuccess = vi.spyOn(notify, 'success');
    const selectedWorkspace = workspace('local');
    const pending = {
      ...item(),
      target: {
        workspaceId: selectedWorkspace.id,
        workspaceFlavour: selectedWorkspace.flavour,
        tagIds: [],
      },
    } satisfies PendingShareItem;
    let markerHidden = false;
    const importer = {
      getShareDestinationOptions: vi.fn().mockResolvedValue({
        verification: 'confirmed',
        tags: [],
        collections: [],
      }),
      importShareToWorkspace: vi
        .fn()
        .mockResolvedValue({ status: 'imported', docId: pending.documentId }),
    };
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [selectedWorkspace] } },
      getProfile: () => ({ name$: { value: 'Local workspace' } }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, importer);
    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi.fn(async () =>
        markerHidden ? [] : [{ status: 'ready' as const, item: pending }]
      ),
      updateTarget: vi.fn().mockResolvedValue(undefined),
      resolveAttachment: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockRejectedValue(new Error('cleanup failed')),
      setError: vi.fn().mockResolvedValue(undefined),
    };

    render(<ShareImportController provider={provider} />);

    await screen.findByText(
      'This share was saved, but AFFiNE could not clear it from the inbox. Try again.'
    );
    const saveButton = screen.getByRole('button', { name: 'Save' });
    await waitFor(() =>
      expect((saveButton as HTMLButtonElement).disabled).toBe(false)
    );

    markerHidden = true;
    fireEvent.click(saveButton);

    await waitFor(() =>
      expect(screen.queryByText('Choose where to save')).toBeNull()
    );
    expect(importer.importShareToWorkspace).toHaveBeenCalledTimes(1);
    expect(provider.complete).toHaveBeenCalledTimes(1);
    expect(provider.setError).not.toHaveBeenCalledWith(
      pending.id,
      'completion-failed'
    );
    expect(notifySuccess).toHaveBeenCalledTimes(1);
  });

  test('manually retries completion through committed replay and clears the item', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const notifySuccess = vi.spyOn(notify, 'success');
    const selectedWorkspace = workspace('local');
    const uiWorkspace = {
      id: 'ui-workspace',
      flavour: 'local',
    } as WorkspaceMetadata;
    const persistedTarget = {
      workspaceId: selectedWorkspace.id,
      workspaceFlavour: selectedWorkspace.flavour,
      tagIds: ['persisted-tag'],
      collectionId: 'persisted-collection',
    };
    const pending = {
      ...item(),
      target: persistedTarget,
    } satisfies PendingShareItem;
    let completed = false;
    const committedReplay = {
      status: 'committed-replay' as const,
      docId: pending.documentId,
    };
    const importer = {
      getShareDestinationOptions: vi.fn().mockResolvedValue({
        verification: 'confirmed',
        tags: [],
        collections: [],
      }),
      importShareToWorkspace: vi
        .fn()
        .mockResolvedValueOnce({
          status: 'imported',
          docId: pending.documentId,
        })
        .mockResolvedValueOnce(committedReplay),
    };
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [selectedWorkspace, uiWorkspace] } },
      getProfile: (current: WorkspaceMetadata) => ({
        name$: {
          value:
            current.id === selectedWorkspace.id
              ? 'Persisted workspace'
              : 'UI workspace',
        },
      }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, importer);
    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi.fn(async () =>
        completed ? [] : [{ status: 'ready' as const, item: pending }]
      ),
      updateTarget: vi.fn().mockResolvedValue(undefined),
      resolveAttachment: vi.fn().mockResolvedValue(undefined),
      complete: vi
        .fn()
        .mockRejectedValueOnce(new Error('cleanup failed'))
        .mockImplementationOnce(async () => {
          completed = true;
        }),
      setError: vi.fn().mockResolvedValue(undefined),
    };

    render(<ShareImportController provider={provider} />);

    await screen.findByText(
      'This share was saved, but AFFiNE could not clear it from the inbox. Try again.'
    );
    const saveButton = screen.getByRole('button', { name: 'Save' });
    await waitFor(() =>
      expect((saveButton as HTMLButtonElement).disabled).toBe(false)
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Workspace Persisted workspace/ })
    );
    fireEvent.click(screen.getByRole('button', { name: /UI workspace/ }));
    const retryButton = screen.getByRole('button', { name: 'Save' });
    await waitFor(() =>
      expect((retryButton as HTMLButtonElement).disabled).toBe(false)
    );

    fireEvent.click(retryButton);

    await waitFor(() => expect(provider.complete).toHaveBeenCalledTimes(2));
    await expect(
      importer.importShareToWorkspace.mock.results[1]?.value
    ).resolves.toEqual(committedReplay);
    expect(importer.importShareToWorkspace).toHaveBeenCalledTimes(2);
    expect(importer.importShareToWorkspace).toHaveBeenNthCalledWith(
      2,
      selectedWorkspace,
      expect.objectContaining({
        tagIds: persistedTarget.tagIds,
        collectionId: persistedTarget.collectionId,
      }),
      { allowOffline: false }
    );
    expect(provider.updateTarget).toHaveBeenLastCalledWith(
      pending.id,
      persistedTarget
    );
    expect(provider.complete).toHaveBeenNthCalledWith(
      1,
      pending.id,
      pending.documentId
    );
    expect(provider.complete).toHaveBeenNthCalledWith(
      2,
      pending.id,
      pending.documentId
    );
    expect(provider.setError).not.toHaveBeenCalledWith(
      pending.id,
      'completion-failed'
    );
    await waitFor(() => expect(notifySuccess).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByText('Choose where to save')).toBeNull()
    );
    expect(
      screen.queryByText(
        'This share was saved, but AFFiNE could not clear it from the inbox. Try again.'
      )
    ).toBeNull();
  });

  test('cold-start replay retries only completion and emits one success notification', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const notifySuccess = vi.spyOn(notify, 'success');
    const selectedWorkspace = workspace('local');
    const pending = {
      ...item(),
      target: {
        workspaceId: selectedWorkspace.id,
        workspaceFlavour: selectedWorkspace.flavour,
        tagIds: [],
      },
    } satisfies PendingShareItem;
    let completed = false;
    const importer = {
      getShareDestinationOptions: vi.fn().mockResolvedValue({
        verification: 'confirmed',
        tags: [],
        collections: [],
      }),
      importShareToWorkspace: vi
        .fn()
        .mockResolvedValueOnce({
          status: 'imported',
          docId: pending.documentId,
        })
        .mockResolvedValueOnce({
          status: 'committed-replay',
          docId: pending.documentId,
        }),
    };
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [selectedWorkspace] } },
      getProfile: () => ({ name$: { value: 'Local workspace' } }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, importer);
    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi.fn(async () =>
        completed ? [] : [{ status: 'ready' as const, item: pending }]
      ),
      updateTarget: vi.fn().mockResolvedValue(undefined),
      resolveAttachment: vi.fn().mockResolvedValue(undefined),
      complete: vi
        .fn()
        .mockRejectedValueOnce(new Error('cleanup failed'))
        .mockImplementationOnce(async () => {
          completed = true;
        }),
      setError: vi.fn().mockResolvedValue(undefined),
    };

    const firstLaunch = render(<ShareImportController provider={provider} />);
    await screen.findByText(
      'This share was saved, but AFFiNE could not clear it from the inbox. Try again.'
    );
    firstLaunch.unmount();

    render(<ShareImportController provider={provider} />);

    await waitFor(() => expect(provider.complete).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(notifySuccess).toHaveBeenCalledTimes(1));
    expect(importer.importShareToWorkspace).toHaveBeenCalledTimes(2);
    expect(provider.complete).toHaveBeenLastCalledWith(
      pending.id,
      pending.documentId
    );
    expect(screen.queryByText('Choose where to save')).toBeNull();
  });

  test('ignores a stale attachment result after the inbox item changes', async () => {
    let resolveA!: (file: File | undefined) => void;
    let resolveB!: (file: File | undefined) => void;
    const createObjectURL = vi
      .fn()
      .mockReturnValueOnce('blob:b')
      .mockReturnValueOnce('blob:unexpected');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const itemA = {
      ...item(),
      id: 'a',
      content: { kind: 'image' as const },
    } satisfies PendingShareItem;
    const itemB = { ...itemA, id: 'b' };
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [] } },
      getProfile: () => ({ name$: { value: '' } }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, {});
    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi
        .fn()
        .mockResolvedValueOnce([{ status: 'ready' as const, item: itemA }])
        .mockResolvedValueOnce([{ status: 'ready' as const, item: itemB }]),
      updateTarget: vi.fn(),
      resolveAttachment: vi.fn((id: string) =>
        id === 'a'
          ? new Promise<File | undefined>(resolve => (resolveA = resolve))
          : new Promise<File | undefined>(resolve => (resolveB = resolve))
      ),
      complete: vi.fn(),
      setError: vi.fn(),
    };

    const view = render(<ShareImportController provider={provider} />);
    await screen.findByText('Shared');
    window.dispatchEvent(new Event('affine:share-inbox'));
    await waitFor(() =>
      expect(provider.resolveAttachment).toHaveBeenCalledWith('b')
    );

    resolveB(new File(['b'], 'b.png', { type: 'image/png' }));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    resolveA(new File(['a'], 'a.png', { type: 'image/png' }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(document.querySelector('img')?.getAttribute('src')).toBe('blob:b');
    expect(revokeObjectURL).not.toHaveBeenCalled();
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:b');
  });

  test('does not retain or create an object URL when an attachment resolves after unmount', async () => {
    let resolveAttachment!: (file: File | undefined) => void;
    const createObjectURL = vi.fn(() => 'blob:late');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const shared = {
      ...item(),
      content: { kind: 'image' as const },
    } satisfies PendingShareItem;
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [] } },
      getProfile: () => ({ name$: { value: '' } }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, {});
    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi
        .fn()
        .mockResolvedValue([{ status: 'ready' as const, item: shared }]),
      updateTarget: vi.fn(),
      resolveAttachment: vi.fn(
        () =>
          new Promise<File | undefined>(
            resolve => (resolveAttachment = resolve)
          )
      ),
      complete: vi.fn(),
      setError: vi.fn(),
    };

    const view = render(<ShareImportController provider={provider} />);
    await screen.findByText('Shared');
    view.unmount();
    resolveAttachment(new File(['late'], 'late.png', { type: 'image/png' }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  test('previews the original image File and revokes its object URL on unmount', async () => {
    const createObjectURL = vi.fn(() => 'blob:shared-image');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const image = new File(['image'], 'shared.png', { type: 'image/png' });
    const shared = {
      ...item(),
      content: { kind: 'image' as const },
      attachments: [{ fileName: 'shared.png', mimeType: 'image/png' }],
    } satisfies PendingShareItem;
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [] } },
      getProfile: () => ({ name$: { value: '' } }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, {});
    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi
        .fn()
        .mockResolvedValue([{ status: 'ready' as const, item: shared }]),
      updateTarget: vi.fn(),
      resolveAttachment: vi.fn().mockResolvedValue(image),
      complete: vi.fn(),
      setError: vi.fn(),
    };

    const view = render(<ShareImportController provider={provider} />);

    await screen.findByText('Shared');
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledWith(image));
    await waitFor(() =>
      expect(document.querySelector('img')?.getAttribute('src')).toBe(
        'blob:shared-image'
      )
    );
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:shared-image');
  });

  test('keeps a PDF inbox item when its File is missing', async () => {
    const selectedWorkspace = workspace('local');
    const shared = {
      ...item(),
      content: { kind: 'pdf' as const },
      attachments: [{ fileName: 'report.pdf', mimeType: 'application/pdf' }],
    } satisfies PendingShareItem;
    const importer = {
      getShareDestinationOptions: vi.fn().mockResolvedValue({
        verification: 'confirmed',
        tags: [],
        collections: [],
      }),
      importShareToWorkspace: vi.fn(),
    };
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [selectedWorkspace] } },
      getProfile: () => ({ name$: { value: 'Local workspace' } }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, importer);
    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi
        .fn()
        .mockResolvedValue([{ status: 'ready' as const, item: shared }]),
      updateTarget: vi.fn().mockResolvedValue(undefined),
      resolveAttachment: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockResolvedValue(undefined),
      setError: vi.fn().mockResolvedValue(undefined),
    };

    render(<ShareImportController provider={provider} />);

    await screen.findByText('Choose where to save');
    fireEvent.click(screen.getByRole('button', { name: /Workspace Choose/ }));
    fireEvent.click(screen.getByRole('button', { name: /Local workspace/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(provider.setError).toHaveBeenCalledWith(
        'item',
        'attachment-missing'
      )
    );
    expect(importer.importShareToWorkspace).not.toHaveBeenCalled();
    expect(provider.complete).not.toHaveBeenCalled();
  });

  test('does not save workspace A preview after switching to B before B responds', async () => {
    const workspaceA = {
      id: 'workspace-a',
      flavour: 'server-a',
    } as WorkspaceMetadata;
    const workspaceB = {
      id: 'workspace-b',
      flavour: 'server-b',
    } as WorkspaceMetadata;
    const serverA = server(
      'server-a',
      'https://server-a.example/',
      ServerDeploymentType.Selfhosted
    );
    const serverB = server(
      'server-b',
      'https://server-b.example/',
      ServerDeploymentType.Selfhosted
    );
    Object.assign(serverA, {
      fetch: vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ url: item().content.url, title: 'Preview A' }),
            { status: 200 }
          )
        ),
    });
    Object.assign(serverB, {
      fetch: vi.fn(() => new Promise<Response>(() => {})),
    });
    const importer = {
      getShareDestinationOptions: vi.fn().mockResolvedValue({
        verification: 'confirmed',
        tags: [],
        collections: [],
      }),
      importShareToWorkspace: vi
        .fn()
        .mockResolvedValue({ status: 'imported', docId: 'saved-doc' }),
    };
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [workspaceA, workspaceB] } },
      getProfile: (workspace: WorkspaceMetadata) => ({
        name$: {
          value: workspace.id === workspaceA.id ? 'Workspace A' : 'Workspace B',
        },
      }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [serverA, serverB] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, importer);
    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi
        .fn()
        .mockResolvedValue([{ status: 'ready' as const, item: item() }]),
      updateTarget: vi.fn().mockResolvedValue(undefined),
      resolveAttachment: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockResolvedValue(undefined),
      setError: vi.fn().mockResolvedValue(undefined),
    };

    render(<ShareImportController provider={provider} />);

    await screen.findByText('Choose where to save');
    fireEvent.click(screen.getByRole('button', { name: /Workspace Choose/ }));
    fireEvent.click(screen.getByRole('button', { name: /Workspace A/ }));
    await screen.findByText('Preview A');

    fireEvent.click(
      screen.getByRole('button', { name: /Workspace Workspace A/ })
    );
    fireEvent.click(screen.getByRole('button', { name: /Workspace B/ }));
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
          .disabled
      ).toBe(false)
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(
      () => expect(importer.importShareToWorkspace).toHaveBeenCalled(),
      { timeout: 2500 }
    );
    expect(importer.importShareToWorkspace).toHaveBeenCalledWith(
      workspaceB,
      expect.objectContaining({ preview: undefined }),
      { allowOffline: false }
    );
  });

  test('keeps one workspace selection across preview completion and refreshes', async () => {
    const selectedWorkspace = {
      id: 'selected-workspace',
      flavour: 'local',
    } as WorkspaceMetadata;
    const workspaces$ = { value: [selectedWorkspace] };
    const servers$ = { value: [] as Server[] };
    const pending = {
      ...item(),
      content: {
        kind: 'url' as const,
        url: 'https://youtube.com/watch?v=selection',
      },
    } satisfies PendingShareItem;
    const previewFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ url: pending.content.url }), {
        status: 200,
      })
    );
    vi.stubGlobal('fetch', previewFetch);

    const importer = {
      getShareDestinationOptions: vi.fn().mockResolvedValue({
        verification: 'confirmed',
        tags: [{ id: 'tag-one', name: 'Tag One', color: '#123456' }],
        collections: [{ id: 'collection-one', name: 'Collection One' }],
      }),
      importShareToWorkspace: vi
        .fn()
        .mockResolvedValue({ status: 'imported', docId: 'saved-doc' }),
    };
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$ },
      getProfile: () => ({ name$: { value: 'Workspace One' } }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$,
    });
    controllerServiceMocks.services.set(ImportClipperService.name, importer);

    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi
        .fn()
        .mockResolvedValue([{ status: 'ready' as const, item: pending }]),
      updateTarget: vi.fn().mockResolvedValue(undefined),
      resolveAttachment: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockResolvedValue(undefined),
      setError: vi.fn().mockResolvedValue(undefined),
    };
    const view = render(<ShareImportController provider={provider} />);

    await screen.findByText('Choose where to save');
    fireEvent.click(screen.getByRole('button', { name: /Workspace Choose/ }));
    fireEvent.click(screen.getByRole('button', { name: /Workspace One/ }));

    const save = await screen.findByRole('button', { name: 'Save' });
    await waitFor(() =>
      expect((save as HTMLButtonElement).disabled).toBe(false)
    );
    expect(
      screen.getByRole('button', { name: /Workspace Workspace One/ })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Tags Optional/ }));
    await screen.findByRole('button', { name: /Tag One/ });
    await waitFor(() => expect(provider.listPending).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Tags')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Tag One/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(
      screen.getByRole('button', { name: /Collection Optional/ })
    );
    fireEvent.click(
      await screen.findByRole('button', { name: 'Collection One' })
    );

    workspaces$.value = [{ ...selectedWorkspace }];
    servers$.value = [];
    view.rerender(<ShareImportController provider={provider} />);
    expect(
      screen.getByRole('button', { name: /Workspace Workspace One/ })
    ).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
        .disabled
    ).toBe(false);
    expect(provider.listPending).toHaveBeenCalledTimes(1);

    workspaces$.value = [];
    view.rerender(<ShareImportController provider={provider} />);
    expect(
      (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    workspaces$.value = [{ ...selectedWorkspace }];
    view.rerender(<ShareImportController provider={provider} />);
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement)
          .disabled
      ).toBe(false)
    );

    window.dispatchEvent(new Event('affine:share-inbox'));
    await waitFor(() => expect(provider.listPending).toHaveBeenCalledTimes(2));
    expect(
      screen.getByRole('button', { name: /Workspace Workspace One/ })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(provider.updateTarget).toHaveBeenCalledWith('item', {
        workspaceId: 'selected-workspace',
        workspaceFlavour: 'local',
        tagIds: ['tag-one'],
        collectionId: 'collection-one',
      })
    );
    expect(importer.getShareDestinationOptions).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'selected-workspace', flavour: 'local' })
    );
    expect(importer.importShareToWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'selected-workspace', flavour: 'local' }),
      expect.objectContaining({
        tagIds: ['tag-one'],
        collectionId: 'collection-one',
      }),
      { allowOffline: false }
    );
  });

  test('leaves an unsupported inbox entry intact while showing the upgrade-required state', async () => {
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [] } },
      getProfile: () => ({ name$: { value: '' } }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, {});
    const provider = {
      updateWorkspaceMode: vi.fn().mockResolvedValue(undefined),
      listPending: vi.fn().mockResolvedValue([
        {
          status: 'unsupported-version' as const,
          id: 'item',
          schemaVersion: 3,
        },
      ]),
      updateTarget: vi.fn(),
      resolveAttachment: vi.fn(),
      complete: vi.fn(),
      setError: vi.fn(),
    };

    render(<ShareImportController provider={provider} />);

    await screen.findByText('Update required');
    expect(screen.getByText(/stay in your inbox until then/i)).toBeTruthy();
    expect(provider.complete).not.toHaveBeenCalled();
  });
});

describe('share preview presentation', () => {
  test.each([
    [
      'loading',
      () => new Promise<never>(() => {}),
      'Loading link preview',
      undefined,
    ],
    [
      'failed',
      () => Promise.reject(new Error('unavailable')),
      'Preview unavailable',
      undefined,
    ],
    [
      'partial',
      () => Promise.resolve({ url: item().content.url! }),
      'youtube.com',
      undefined,
    ],
    [
      'aborted',
      () => Promise.reject(new DOMException('Aborted', 'AbortError')),
      'youtube.com',
      undefined,
    ],
    [
      'invalid persisted URL',
      () => Promise.reject(new Error('unavailable')),
      'Link',
      '/relative',
    ],
  ])('renders the %s state', async (_name, load, expected, url) => {
    const owner = {
      routeEndpoint: 'https://app.affine.pro/api/worker/link-preview',
      selectWorkspace: vi.fn(),
      load,
    } as unknown as SharePreviewRouteOwner;
    render(
      <LinkPreview
        item={{
          ...item('official'),
          content: {
            ...item('official').content,
            url: url ?? item().content.url,
          },
        }}
        owner={owner}
        workspace={undefined}
        servers={[]}
        onPreview={() => {}}
      />
    );
    await waitFor(() =>
      expect(screen.getAllByText(expected).length).toBeGreaterThan(0)
    );
  });

  test('ignores stale preview results after the item changes', async () => {
    let resolveFirst!: (preview: ShareLinkPreview) => void;
    let resolveSecond!: (preview: ShareLinkPreview) => void;
    const load = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<ShareLinkPreview>(resolve => {
            resolveFirst = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<ShareLinkPreview>(resolve => {
            resolveSecond = resolve;
          })
      );
    const owner = {
      selectWorkspace: vi.fn(),
      load,
      workspaceKey: 'self:workspace',
      generation: 1,
    } as unknown as SharePreviewRouteOwner;
    const onPreview = vi.fn();
    const firstItem = { ...item('official'), id: 'first' };
    const secondItem = { ...item('official'), id: 'second' };
    const view = render(
      <LinkPreview
        item={firstItem}
        owner={owner}
        workspace={undefined}
        servers={[]}
        onPreview={onPreview}
      />
    );
    view.rerender(
      <LinkPreview
        item={secondItem}
        owner={owner}
        workspace={undefined}
        servers={[]}
        onPreview={onPreview}
      />
    );

    resolveFirst({ url: firstItem.content.url!, title: 'Stale preview' });
    await Promise.resolve();
    expect(screen.queryByText('Stale preview')).toBeNull();
    expect(onPreview).not.toHaveBeenCalled();

    resolveSecond({ url: secondItem.content.url!, title: 'Current preview' });
    await screen.findByText('Current preview');
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 'second',
        workspaceKey: 'self:workspace',
        generation: 1,
        value: expect.objectContaining({ title: 'Current preview' }),
      })
    );
  });

  test('uses one media-first card for rich preview content', async () => {
    const shared = {
      ...item(),
      content: {
        ...item().content,
        text: 'Selected passage',
      },
    } satisfies PendingShareItem;
    const owner = {
      routeEndpoint: 'https://app.affine.pro/api/worker/link-preview',
      selectWorkspace: vi.fn(),
      load: () =>
        Promise.resolve({
          url: shared.content.url!,
          title: 'Provider title',
          images: ['https://youtube.com/thumbnail.jpg'],
          transcript: {
            segments: [{ text: '  Hello\n\tworld  ' }, { text: ' again ' }],
          },
        }),
    } as unknown as SharePreviewRouteOwner;
    const { container } = render(
      <LinkPreview
        item={shared}
        owner={owner}
        workspace={undefined}
        servers={[]}
        onPreview={() => {}}
      />
    );

    await screen.findByText('Transcript');
    expect(screen.getByText('Hello world again')).toBeTruthy();
    expect(
      screen.getByRole('group', {
        name: 'Transcript preview: Hello world again',
      })
    ).toBeTruthy();
    expect(screen.getByText('Selected passage')).toBeTruthy();
    expect(container.querySelector('section > img')?.getAttribute('src')).toBe(
      'https://youtube.com/thumbnail.jpg'
    );
    const family = String.fromCodePoint(
      0x1f468,
      0x200d,
      0x1f469,
      0x200d,
      0x1f467
    );
    expect(
      transcriptPreviewText({
        segments: [{ text: '  ' }, { text: family.repeat(241) }],
      })
    ).toBe(`${family.repeat(240)}…`);
    expect(
      transcriptPreviewText({ segments: [{ text: '\n\t' }] })
    ).toBeUndefined();
  });

  test('keeps failure compact without an empty media region', async () => {
    const owner = {
      routeEndpoint: 'https://app.affine.pro/api/worker/link-preview',
      selectWorkspace: vi.fn(),
      load: () => Promise.reject(new Error('unavailable')),
    } as unknown as SharePreviewRouteOwner;
    const { container } = render(
      <LinkPreview
        item={item('official')}
        owner={owner}
        workspace={undefined}
        servers={[]}
        onPreview={() => {}}
      />
    );

    await screen.findByText('Preview unavailable');
    expect(container.querySelector('section > img')).toBeNull();
  });

  test.each([
    ['Shared', 'Provider title', 'host', 'Provider title'],
    ['Saved title', 'Provider title', 'host', 'Saved title'],
    ['Shared', undefined, 'host', 'host'],
  ])(
    'preserves the title priority',
    (original, preview, fallback, expected) => {
      expect(resolveShareTitle(original, preview, fallback)).toBe(expected);
    }
  );
});

describe('share document block projection', () => {
  test.each<[string, ShareImportInput, unknown, unknown, string]>([
    [
      'generic metadata',
      {
        documentId: 'doc',
        importAttemptId: 'attempt',
        title: 'Page',
        content: { kind: 'url', url: 'https://example.com' },
        preview: {
          url: 'https://redirect.example',
          title: 'Example',
          description: 'Description',
          favicons: ['https://example.com/icon.png'],
          images: ['https://example.com/image.png'],
        },
        tagIds: [],
      },
      null,
      [
        {
          id: 'share-attempt-bookmark',
          flavour: 'affine:bookmark',
          props: {
            url: 'https://example.com',
            title: 'Example',
            description: 'Description',
            icon: 'https://example.com/icon.png',
            image: 'https://example.com/image.png',
            style: 'horizontal',
          },
        },
      ],
      '',
    ],
    [
      'YouTube selection without a transcript body',
      {
        documentId: 'doc',
        importAttemptId: 'attempt',
        title: 'Video',
        content: {
          kind: 'url',
          url: 'https://youtube.com/watch?v=123',
          text: 'Selected passage',
        },
        preview: {
          url: 'https://youtube.com/watch?v=123',
          provider: 'youtube',
          transcript: {
            chapters: [{ title: 'Opening', startSeconds: 0 }],
            segments: [
              { text: 'Welcome', startSeconds: 1, speaker: 'Host' },
              { text: 'Plain paragraph' },
            ],
          },
        },
        tagIds: [],
      },
      { flavour: 'affine:embed-youtube', styles: ['video'] },
      [
        {
          id: 'share-attempt-bookmark',
          flavour: 'affine:bookmark',
          props: {
            url: 'https://youtube.com/watch?v=123',
            title: 'Video',
            description: undefined,
            icon: undefined,
            image: undefined,
            style: 'horizontal',
          },
        },
        {
          id: 'share-attempt-selected-text',
          flavour: 'affine:paragraph',
          props: { type: 'quote', text: 'Selected passage' },
        },
      ],
      '',
    ],
    [
      'X duplicate transcript',
      {
        documentId: 'doc',
        importAttemptId: 'attempt',
        title: 'Post',
        content: { kind: 'url', url: 'https://x.com/affine/status/123' },
        preview: {
          url: 'https://x.com/affine/status/123',
          provider: 'x',
          description: 'A complete post',
          transcript: {
            segments: [{ text: 'A complete' }, { text: 'post' }],
          },
        },
        tagIds: [],
      },
      null,
      [
        {
          id: 'share-attempt-bookmark',
          flavour: 'affine:bookmark',
          props: {
            url: 'https://x.com/affine/status/123',
            title: 'Post',
            description: 'A complete post',
            icon: undefined,
            image: undefined,
            style: 'horizontal',
          },
        },
      ],
      '',
    ],
    [
      'plain text',
      {
        documentId: 'doc',
        importAttemptId: 'attempt',
        title: 'Note',
        content: { kind: 'text', text: 'Plain *shared* text' },
        tagIds: [],
      },
      null,
      [],
      'Plain \\*shared\\* text',
    ],
  ])(
    'creates the same stable projection for %s',
    (_name, input, _embed, expected, markdown) => {
      const first = createCompatibilityShareBlockPlan(input);
      expect(first).toEqual(expected);
      expect(createCompatibilityShareBlockPlan(input)).toEqual(expected);
      for (const node of first) {
        expect(node.props).not.toHaveProperty('sharePreviewSourceId');
        expect(node.props).not.toHaveProperty('sharePreviewVersion');
      }
      expect(createShareMarkdown(input)).toBe(markdown);
    }
  );
});

describe('collapsed content accessibility', () => {
  test('uses native button semantics and identifies the controlled content', async () => {
    if (!customElements.get('blocksuite-toggle-button')) {
      customElements.define('blocksuite-toggle-button', ToggleButton);
    }
    const toggle = document.createElement('blocksuite-toggle-button');
    toggle.collapsed = true;
    toggle.controls = 'heading-children-id';
    toggle.updateCollapsed = vi.fn();
    document.body.append(toggle);
    await toggle.updateComplete;

    const button = toggle.querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe('Expand content');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe('heading-children-id');
    button.click();
    expect(toggle.updateCollapsed).toHaveBeenCalledWith(false);
  });
});
