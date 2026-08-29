/** @vitest-environment happy-dom */

import { type Server, ServersService } from '@affine/core/modules/cloud';
import {
  ImportClipperService,
  type ShareImportInput,
} from '@affine/core/modules/import-clipper';
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
import { createShareMarkdown } from '../../../modules/import-clipper/services/import';
import { createShareBlockPlan } from '../../../modules/import-clipper/services/share-block-plan';
import { ShareImportController } from './index';
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

afterEach(() => {
  cleanup();
  controllerServiceMocks.services.clear();
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

describe('share destination selection lifecycle', () => {
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
  test.each<
    [
      string,
      ShareImportInput,
      Parameters<typeof createShareBlockPlan>[1],
      unknown,
      string,
    ]
  >([
    [
      'generic metadata',
      {
        documentId: 'doc',
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
      'YouTube selection, chapters, and structured transcript',
      {
        documentId: 'doc',
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
          flavour: 'affine:embed-youtube',
          props: {
            url: 'https://youtube.com/watch?v=123',
            style: 'video',
          },
        },
        {
          flavour: 'affine:paragraph',
          props: { type: 'quote', text: 'Selected passage' },
        },
        {
          flavour: 'affine:callout',
          props: {
            icon: { type: 'emoji', unicode: '💬' },
            backgroundColorName: 'grey',
          },
          children: [
            {
              flavour: 'affine:paragraph',
              props: { type: 'h6', text: 'Transcript', collapsed: true },
            },
            {
              flavour: 'affine:paragraph',
              props: { type: 'h6', text: 'Opening' },
            },
            {
              flavour: 'affine:paragraph',
              props: { type: 'text', text: '[0:01] Host: Welcome' },
            },
            {
              flavour: 'affine:paragraph',
              props: { type: 'text', text: 'Plain paragraph' },
            },
          ],
        },
      ],
      '',
    ],
    [
      'X duplicate transcript',
      {
        documentId: 'doc',
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
          flavour: 'affine:bookmark',
          props: {
            url: 'https://x.com/affine/status/123',
            title: undefined,
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
    (_name, input, embed, expected, markdown) => {
      expect(createShareBlockPlan(input, embed)).toEqual(expected);
      expect(createShareBlockPlan(input, embed)).toEqual(expected);
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
