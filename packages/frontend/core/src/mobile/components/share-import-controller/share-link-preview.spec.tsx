/** @vitest-environment happy-dom */

import { notify } from '@affine/component';
import { type Server, ServersService } from '@affine/core/modules/cloud';
import { ImportClipperService } from '@affine/core/modules/import-clipper';
import {
  type WorkspaceMetadata,
  WorkspacesService,
} from '@affine/core/modules/workspace';
import { ServerDeploymentType } from '@affine/graphql';
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
import type * as Infra from '@toeverything/infra';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  createAffineLinkPreviewFetch,
  resolveLinkPreviewEndpoint,
} from '../../../blocksuite/view-extensions/link-preview-service/link-preview-service';
import { ShareImportController } from './index';
import { LinkPreview, resolveShareTitle } from './link-preview';
import { parseShareLinkPreview } from './preview';
import {
  previewForImport,
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
    useLiveData: (source: { value: unknown } | undefined) => source?.value,
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

const item = () =>
  ({
    id: 'item',
    documentId: 'doc',
    schemaVersion: 2,
    importAttemptId: 'attempt',
    title: 'Shared',
    content: { kind: 'url', url: 'https://youtube.com/watch?v=123' },
  }) as unknown as PendingShareItem;

const officialMedia = (name: string) =>
  `https://app.affine.pro/api/worker/image-proxy?url=${name}`;

const exactASCII = (length: number) => 'x'.repeat(length);
const exactURL = (prefix: string) =>
  `${prefix}${'x'.repeat(8192 - new TextEncoder().encode(prefix).byteLength)}`;

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

afterEach(() => {
  cleanup();
  controllerServiceMocks.services.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('link preview response parsing', () => {
  test('accepts a complete bounded response', () => {
    const preview = {
      url: 'https://www.youtube.com/watch?v=video-id',
      title: '标题 🎬',
      siteName: 'YouTube',
      description: 'A rich description',
      images: [officialMedia('thumbnail')],
      favicons: [officialMedia('favicon')],
      mediaType: 'video',
      provider: 'youtube',
      author: {
        name: 'Creator',
        handle: '@creator',
        avatar: officialMedia('avatar'),
      },
      publishedAt: '2026-08-30T00:00:00Z',
      durationSeconds: 214,
      transcript: {
        language: 'zh-CN',
        segments: [
          {
            text: '第一段 🎵',
            startSeconds: 1.5,
            durationSeconds: 2,
            speaker: 'Narrator',
          },
        ],
        chapters: [{ title: 'Intro', startSeconds: 0 }],
        truncated: false,
      },
    } satisfies ShareLinkPreview;

    expect(parseShareLinkPreview(preview)).toEqual(preview);
  });

  test('accepts every field at its inclusive UTF-8 boundary', () => {
    const mediaURL = exactURL(
      'https://app.affine.pro/api/worker/image-proxy?url='
    );
    const preview = {
      url: exactURL('https://example.com/'),
      title: exactASCII(4096),
      siteName: exactASCII(512),
      description: exactASCII(32_768),
      images: Array.from({ length: 8 }, () => mediaURL),
      favicons: Array.from({ length: 8 }, () => mediaURL),
      mediaType: exactASCII(256),
      provider: exactASCII(256),
      author: {
        name: exactASCII(512),
        handle: exactASCII(512),
        avatar: mediaURL,
      },
      publishedAt: exactASCII(128),
      durationSeconds: 604_800,
      transcript: {
        language: exactASCII(128),
        segments: [
          {
            text: exactASCII(16_384),
            startSeconds: 604_800,
            durationSeconds: 604_800,
            speaker: exactASCII(512),
          },
        ],
        chapters: [{ title: exactASCII(4096), startSeconds: 604_800 }],
        truncated: true,
      },
    } satisfies ShareLinkPreview;

    expect(parseShareLinkPreview(preview)).toEqual(preview);
  });

  test.each([
    ['missing source URL', {}],
    ['relative source URL', { url: '/relative' }],
    ['credential source URL', { url: 'https://user:pass@example.com' }],
    [
      'oversized source URL',
      { url: `https://example.com/${'x'.repeat(8192)}` },
    ],
    [
      'oversized title',
      { url: 'https://example.com', title: '界'.repeat(1366) },
    ],
    [
      'oversized description',
      { url: 'https://example.com', description: 'x'.repeat(32_769) },
    ],
    [
      'too many images',
      {
        url: 'https://example.com',
        images: Array.from({ length: 9 }, (_, index) =>
          officialMedia(`i${index}`)
        ),
      },
    ],
    [
      'oversized author',
      { url: 'https://example.com', author: { name: 'x'.repeat(513) } },
    ],
    ['negative duration', { url: 'https://example.com', durationSeconds: -1 }],
    [
      'too many transcript segments',
      {
        url: 'https://example.com',
        transcript: {
          segments: Array.from({ length: 501 }, () => ({ text: 'segment' })),
        },
      },
    ],
    [
      'oversized segment',
      {
        url: 'https://example.com',
        transcript: { segments: [{ text: '界'.repeat(5462) }] },
      },
    ],
    [
      'too many chapters',
      {
        url: 'https://example.com',
        transcript: {
          segments: [{ text: 'segment' }],
          chapters: Array.from({ length: 101 }, () => ({
            title: 'Chapter',
            startSeconds: 0,
          })),
        },
      },
    ],
  ])('rejects %s', (_name, preview) => {
    expect(parseShareLinkPreview(preview)).toBeUndefined();
  });
});

describe('link preview transport and route ownership', () => {
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
      body: JSON.stringify({
        url: item().content.url,
        include: ['transcript'],
      }),
      credentials: 'omit',
      signal: expect.anything(),
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
          title: 'Preview',
          images: ['https://example.com/image.jpg'],
          provider: 'youtube',
          durationSeconds: 90,
          transcript: { segments: [{ text: 'Transcript' }] },
        }),
        { status: 200 }
      )
    );
    await expect(first).resolves.toMatchObject({
      url: item().content.url,
      title: 'Preview',
      images: [
        'https://changed.example/api/worker/image-proxy?url=https%3A%2F%2Fexample.com%2Fimage.jpg',
      ],
      transcript: { segments: [{ text: 'Transcript' }] },
    });
    await owner.load();
    expect(fetch).toHaveBeenCalledTimes(1);
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
    'attachment-write-failed',
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

  test('queues an inbox refresh event received while listPending is in flight', async () => {
    let resolveFirst!: (entries: []) => void;
    const pending = item();
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
        .mockImplementationOnce(
          () =>
            new Promise<[]>(resolve => {
              resolveFirst = resolve;
            })
        )
        .mockResolvedValueOnce([{ status: 'ready' as const, item: pending }]),
      updateTarget: vi.fn(),
      resolveAttachment: vi.fn(),
      complete: vi.fn(),
      setError: vi.fn(),
    };

    render(<ShareImportController provider={provider} />);
    await waitFor(() => expect(provider.listPending).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new Event('affine:share-inbox'));
    resolveFirst([]);

    await screen.findByText('Choose where to save');
    expect(provider.listPending).toHaveBeenCalledTimes(2);
  });

  test('does not import or complete an item twice when refresh joins a manual save', async () => {
    const selectedWorkspace = workspace('local');
    const shared = item();
    let savedTarget: PendingShareItem['target'];
    let completed = false;
    let resolveImport!: (result: { status: 'imported'; docId: string }) => void;
    const importResult = new Promise<{ status: 'imported'; docId: string }>(
      resolve => {
        resolveImport = resolve;
      }
    );
    const importer = {
      getShareDestinationOptions: vi.fn().mockResolvedValue({
        verification: 'confirmed',
        tags: [],
        collections: [],
      }),
      importShareToWorkspace: vi.fn(() => importResult),
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
        completed
          ? []
          : [
              {
                status: 'ready' as const,
                item: savedTarget ? { ...shared, target: savedTarget } : shared,
              },
            ]
      ),
      updateTarget: vi.fn(
        async (_itemId: string, target: PendingShareItem['target']) => {
          savedTarget = target;
        }
      ),
      resolveAttachment: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn(async () => {
        if (completed) throw new Error('already completed');
        completed = true;
      }),
      setError: vi.fn().mockResolvedValue(undefined),
    };

    render(<ShareImportController provider={provider} />);
    await screen.findByText('Choose where to save');
    fireEvent.click(screen.getByRole('button', { name: /Workspace Choose/ }));
    fireEvent.click(screen.getByRole('button', { name: /Local workspace/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(importer.importShareToWorkspace).toHaveBeenCalledTimes(1)
    );

    window.dispatchEvent(new Event('affine:share-inbox'));
    await waitFor(() => expect(provider.listPending).toHaveBeenCalledTimes(2));
    resolveImport({ status: 'imported', docId: shared.documentId });

    await waitFor(() => expect(provider.complete).toHaveBeenCalledTimes(1));
    expect(importer.importShareToWorkspace).toHaveBeenCalledTimes(1);
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

  test('keeps the resolved image attachment while switching workspaces', async () => {
    const createObjectURL = vi.fn(() => 'blob:shared-image');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const image = new File(['image'], 'shared.png', { type: 'image/png' });
    const shared = {
      ...item(),
      content: { kind: 'image' as const },
      attachments: [{ fileName: 'shared.png', mimeType: 'image/png' }],
    } satisfies PendingShareItem;
    const workspaceA = {
      id: 'workspace-a',
      flavour: 'local',
    } as WorkspaceMetadata;
    const workspaceB = {
      id: 'workspace-b',
      flavour: 'local',
    } as WorkspaceMetadata;
    controllerServiceMocks.services.set(WorkspacesService.name, {
      list: { workspaces$: { value: [workspaceA, workspaceB] } },
      getProfile: (metadata: WorkspaceMetadata) => ({
        name$: {
          value: metadata.id === workspaceA.id ? 'Workspace A' : 'Workspace B',
        },
      }),
    });
    controllerServiceMocks.services.set(ServersService.name, {
      serversWithAccount$: { value: [] },
      servers$: { value: [] },
    });
    controllerServiceMocks.services.set(ImportClipperService.name, {
      getShareDestinationOptions: vi.fn().mockResolvedValue({
        verification: 'confirmed',
        tags: [],
        collections: [],
      }),
    });
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

    render(<ShareImportController provider={provider} />);

    await waitFor(() =>
      expect(provider.resolveAttachment).toHaveBeenCalledTimes(1)
    );
    fireEvent.click(screen.getByRole('button', { name: /Workspace Choose/ }));
    fireEvent.click(screen.getByRole('button', { name: /Workspace A/ }));
    fireEvent.click(
      screen.getByRole('button', { name: /Workspace Workspace A/ })
    );
    fireEvent.click(screen.getByRole('button', { name: /Workspace B/ }));

    await waitFor(() =>
      expect(provider.resolveAttachment).toHaveBeenCalledTimes(1)
    );
    expect(document.querySelector('img')?.getAttribute('src')).toBe(
      'blob:shared-image'
    );
    expect(revokeObjectURL).not.toHaveBeenCalled();
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
      expect.not.objectContaining({ preview: expect.anything() }),
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
      'invalid URL',
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
          ...item(),
          content: {
            ...item().content,
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
    const firstItem = { ...item(), id: 'first' };
    const secondItem = { ...item(), id: 'second' };
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
          durationSeconds: 90,
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

    await screen.findByText('Provider title');
    expect(screen.getByText('Transcript')).toBeTruthy();
    expect(screen.getByText('Hello world again')).toBeTruthy();
    expect(screen.getByText('1:30')).toBeTruthy();
    expect(screen.getByText('Selected passage')).toBeTruthy();
    expect(container.querySelector('section > img')?.getAttribute('src')).toBe(
      'https://youtube.com/thumbnail.jpg'
    );
  });

  test('keeps failure compact without an empty media region', async () => {
    const owner = {
      routeEndpoint: 'https://app.affine.pro/api/worker/link-preview',
      selectWorkspace: vi.fn(),
      load: () => Promise.reject(new Error('unavailable')),
    } as unknown as SharePreviewRouteOwner;
    const { container } = render(
      <LinkPreview
        item={item()}
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
