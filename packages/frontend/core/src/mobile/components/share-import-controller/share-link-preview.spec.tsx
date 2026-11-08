/** @vitest-environment happy-dom */

import { type Server } from '@affine/core/modules/cloud';
import type { WorkspaceMetadata } from '@affine/core/modules/workspace';
import { ServerDeploymentType } from '@affine/graphql';
import { LinkPreviewDetails } from '@blocksuite/affine/components/link-preview';
import {
  type LinkPreviewCacheProvider,
  type LinkPreviewResult,
  LinkPreviewService,
} from '@blocksuite/affine/shared/services';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import * as Infra from '@toeverything/infra';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  createAffineLinkPreviewFetch,
  resolveLinkPreviewEndpoint,
} from '../../../blocksuite/view-extensions/link-preview-service/link-preview-service';
import { LinkPreview, resolveShareTitle } from './link-preview';
import { parseShareLinkPreview, readShareLinkPreview } from './preview';
import { SharePreviewRouteOwner } from './preview-route-owner';
import type { PendingShareItem, ShareLinkPreview } from './types';

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

const workspace = (flavour: string) =>
  ({ id: 'workspace', flavour }) as WorkspaceMetadata;

const server = (id: string, baseUrl: string, type?: ServerDeploymentType) =>
  ({
    id,
    baseUrl,
    config$: new Infra.LiveData({ type }),
    fetch: (...args: Parameters<typeof globalThis.fetch>) =>
      globalThis.fetch(...args),
  }) as unknown as Server;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('link preview response parsing', () => {
  test.each([
    [
      {
        segments: Array.from({ length: 501 }, (_, i) => ({
          text: `Caption ${i}`,
        })),
      },
    ],
    [{ segments: [{ text: '中'.repeat(200_000) }] }],
  ])(
    'clips production transcripts without losing base metadata',
    transcript => {
      const preview = parseShareLinkPreview({
        url: 'https://example.com',
        title: 'Article',
        transcript,
      });
      expect(preview?.title).toBe('Article');
      expect(preview?.transcript?.segments).toHaveLength(1);
      expect(Array.from(preview!.transcript!.segments[0].text)).toHaveLength(
        241
      );
    }
  );
  test('omits malformed optional fields and clips long display values', () => {
    const preview = parseShareLinkPreview({
      url: 'https://example.com',
      title: 'A'.repeat(1000),
      description: 'Summary',
      durationSeconds: -1,
      images: ['bad', officialMedia('one'), officialMedia('two')],
      author: { name: null },
      transcript: { segments: [{ text: '' }, { text: 'Valid' }] },
    });
    expect(preview).toMatchObject({
      title: 'A'.repeat(120) + '…',
      description: 'Summary',
      images: [officialMedia('one')],
      transcript: { segments: [{ text: 'Valid' }] },
    });
    expect(preview?.author).toBeUndefined();
    expect(preview?.durationSeconds).toBeUndefined();
  });
  test('cancels an oversized streamed response before reading the remainder', async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(1024 * 1024 + 1));
        },
        cancel,
      })
    );
    await expect(readShareLinkPreview(response)).rejects.toThrow('too large');
    expect(cancel).toHaveBeenCalledOnce();
  });

  test.each([
    {},
    { url: '/relative' },
    { url: 'https://user:pass@example.com' },
  ])('rejects an invalid source URL', input => {
    expect(parseShareLinkPreview(input)).toBeUndefined();
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
      headers: {
        'Content-Type': 'application/json',
        'x-affine-version': BUILD_CONFIG.appVersion,
      },
      body: JSON.stringify({
        url: item().content.url,
        include: ['transcript'],
      }),
      credentials: 'omit',
      signal: expect.anything(),
    });
  });

  test('isolates base, transcript and endpoint caches', async () => {
    const results = new Map<string, LinkPreviewResult>();
    const requests = new Map<string, Promise<LinkPreviewResult>>();
    const serviceCache: LinkPreviewCacheProvider = {
      get: key => results.get(key),
      set: (key, value) => {
        results.set(key, value);
      },
      getPendingRequest: key => requests.get(key),
      setPendingRequest: (key, value) => {
        requests.set(key, value);
      },
      deletePendingRequest: key => {
        requests.delete(key);
      },
      clear: () => {
        results.clear();
        requests.clear();
      },
    };
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            url: 'https://example.com/article',
            title: 'Article',
            transcript: { segments: [{ text: 'Full transcript' }] },
          })
        )
    );
    const service = new LinkPreviewService(serviceCache, fetch);
    service.setEndpoint('https://one.example/preview');
    const base = await service.query('https://example.com/article');
    const rich = await service.query('https://example.com/article', undefined, [
      'transcript',
    ]);
    expect(base.transcript).toBeUndefined();
    expect(rich.transcript?.segments[0].text).toBe('Full transcript');
    await service.query('https://example.com/article', undefined, [
      'transcript',
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
    service.setEndpoint('https://two.example/preview');
    await service.query('https://example.com/article');
    await service.query('https://example.com/article', undefined, [
      'transcript',
    ]);
    expect(fetch).toHaveBeenCalledTimes(4);
    const first = new AbortController();
    const second = new AbortController();
    await Promise.all([
      service.query('https://example.com/independent', first.signal, [
        'transcript',
      ]),
      service.query('https://example.com/independent', second.signal, [
        'transcript',
      ]),
    ]);
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  test('keeps the official route frozen while destinations change', () => {
    const owner = new SharePreviewRouteOwner({
      ...item(),
      previewRoute: 'official',
    });
    owner.selectWorkspace(workspace('local'), []);
    const generation = owner.generation;
    owner.selectWorkspace(workspace('self'), [
      server('self', 'https://self.example', ServerDeploymentType.Selfhosted),
    ]);
    expect(owner.routeEndpoint).toBe(
      'https://app.affine.pro/api/worker/link-preview'
    );
    expect(owner.generation).toBe(generation);
  });

  test('adds the app version only in the AFFiNE transport', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          url: 'https://example.com/versioned',
          title: 'Preview',
        }),
        { status: 200 }
      )
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
      'https://app.affine.pro/api/worker/link-preview',
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
    const selectedServer = server(
      'self',
      'https://changed.example/',
      ServerDeploymentType.Selfhosted
    );
    owner.selectWorkspace(selected, [selectedServer]);
    const generation = owner.generation;
    const first = owner.load()!;
    owner.selectWorkspace(selected, [selectedServer]);
    expect(owner.generation).toBe(generation);
    expect(owner.load()).toBe(first);
    expect(fetch.mock.calls[0]?.[1]?.headers).toEqual({
      'Content-Type': 'application/json',
      'x-affine-version': BUILD_CONFIG.appVersion,
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
      'https://app.affine.pro/api/worker/link-preview',
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
    expect(previewA?.title).toBe('Preview A');
    owner.selectWorkspace(selectedWorkspace, [replacementServer]);
    const preview = owner.load();

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
    const { container } = render(
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
      />
    );
    await waitFor(() =>
      expect(screen.getAllByText(expected).length).toBeGreaterThan(0)
    );
    expect(container.querySelector('section > img')).toBeNull();
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
    const firstItem = { ...item(), id: 'first' };
    const secondItem = { ...item(), id: 'second' };
    const view = render(
      <LinkPreview
        item={firstItem}
        owner={owner}
        workspace={undefined}
        servers={[]}
      />
    );
    view.rerender(
      <LinkPreview
        item={secondItem}
        owner={owner}
        workspace={undefined}
        servers={[]}
      />
    );

    resolveFirst({ url: firstItem.content.url!, title: 'Stale preview' });
    await Promise.resolve();
    expect(screen.queryByText('Stale preview')).toBeNull();

    resolveSecond({ url: secondItem.content.url!, title: 'Current preview' });
    await screen.findByText('Current preview');
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

describe('editor link details', () => {
  test('loads lazily, renders the full transcript and discards stale URL responses', async () => {
    if (!customElements.get('affine-link-preview-details')) {
      customElements.define('affine-link-preview-details', LinkPreviewDetails);
    }
    let resolve!: (
      value: Awaited<ReturnType<LinkPreviewService['query']>>
    ) => void;
    const query = vi
      .fn<LinkPreviewService['query']>()
      .mockImplementationOnce(
        () =>
          new Promise(done => {
            resolve = done;
          })
      )
      .mockResolvedValue({
        author: { name: 'Author' },
        transcript: {
          segments: [{ text: 'Full '.repeat(1000), startSeconds: 61 }],
          chapters: [{ title: 'Chapter', startSeconds: 0 }],
        },
      });
    const element = document.createElement('affine-link-preview-details');
    element.provider = {
      query,
      endpoint: 'https://example.com/preview',
      setEndpoint: () => {},
    };
    element.url = 'https://example.com/old';
    document.body.append(element);
    await element.updateComplete;
    expect(query).not.toHaveBeenCalled();
    element.shadowRoot!.querySelector('button')!.click();
    await element.updateComplete;
    const oldSignal = query.mock.calls[0][1]!;
    element.url = 'https://example.com/new';
    await element.updateComplete;
    expect(oldSignal.aborted).toBe(true);
    resolve({ transcript: { segments: [{ text: 'Stale transcript' }] } });
    await Promise.resolve();
    element.shadowRoot!.querySelector('button')!.click();
    await waitFor(() =>
      expect(element.shadowRoot!.textContent).toContain('Full '.repeat(1000))
    );
    expect(element.shadowRoot!.textContent).not.toContain('Stale transcript');
    expect(element.shadowRoot!.textContent).toContain('1:01');
    expect(element.shadowRoot!.textContent).toContain('Chapter');
    expect(query.mock.calls[1][2]).toEqual(['transcript']);
    expect(
      element
        .shadowRoot!.querySelector('[contenteditable]')
        ?.getAttribute('contenteditable')
    ).toBe('false');
    element.remove();
  });
});
