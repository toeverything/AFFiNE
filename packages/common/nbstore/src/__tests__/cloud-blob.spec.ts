import {
  abortBlobUploadMutation,
  BlobUploadMethod,
  completeBlobUploadMutation,
  createBlobUploadMutation,
  getBlobUploadPartUrlQuery,
  listBlobsQuery,
  setBlobMutation,
  workspaceBlobQuotaQuery,
} from '@affine/graphql';
import { afterEach, expect, test, vi } from 'vitest';

import { CloudBlobStorage } from '../impls/cloud/blob';
import { BlobSourceRegistry } from '../impls/cloud/blob-source-registry';

const originalBuildConfig = globalThis.BUILD_CONFIG;
const quotaResponse = {
  workspace: {
    quota: {
      humanReadable: {
        blobLimit: '1 MB',
      },
      blobLimit: 1024 * 1024,
    },
  },
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  globalThis.BUILD_CONFIG = originalBuildConfig;
});

function createStorage() {
  return new CloudBlobStorage({
    serverBaseUrl: 'https://example.com',
    id: 'workspace-1',
  });
}

test('uses graphql upload when server returns GRAPHQL method', async () => {
  const storage = createStorage();
  const gqlMock = vi.fn(async ({ query }) => {
    if (query === workspaceBlobQuotaQuery) {
      return quotaResponse;
    }
    if (query === createBlobUploadMutation) {
      return {
        createBlobUpload: {
          method: BlobUploadMethod.GRAPHQL,
          blobKey: 'blob-key',
          alreadyUploaded: false,
        },
      };
    }
    if (query === setBlobMutation) {
      return { setBlob: 'blob-key' };
    }
    throw new Error('Unexpected query');
  });

  vi.spyOn(storage.connection, 'gql').mockImplementation(
    gqlMock as typeof storage.connection.gql
  );

  await storage.set({
    key: 'blob-key',
    data: new Uint8Array([1, 2, 3]),
    mime: 'text/plain',
  });

  const queries = gqlMock.mock.calls.map(call => call[0].query);
  expect(queries).toContain(createBlobUploadMutation);
  expect(queries).toContain(setBlobMutation);
});

test('falls back to graphql when presigned upload fails', async () => {
  const storage = createStorage();
  const gqlMock = vi.fn(async ({ query }) => {
    if (query === workspaceBlobQuotaQuery) {
      return quotaResponse;
    }
    if (query === createBlobUploadMutation) {
      return {
        createBlobUpload: {
          method: BlobUploadMethod.PRESIGNED,
          blobKey: 'blob-key',
          alreadyUploaded: false,
          uploadUrl: 'https://upload.example.com/blob',
        },
      };
    }
    if (query === setBlobMutation) {
      return { setBlob: 'blob-key' };
    }
    if (query === completeBlobUploadMutation) {
      return { completeBlobUpload: 'blob-key' };
    }
    throw new Error('Unexpected query');
  });

  vi.spyOn(storage.connection, 'gql').mockImplementation(
    gqlMock as typeof storage.connection.gql
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 500 }))
  );

  await storage.set({
    key: 'blob-key',
    data: new Uint8Array([1, 2, 3]),
    mime: 'text/plain',
  });

  const queries = gqlMock.mock.calls.map(call => call[0].query);
  expect(queries).toContain(setBlobMutation);
  expect(queries).not.toContain(completeBlobUploadMutation);
});

test('falls back to graphql and aborts when multipart upload fails', async () => {
  const storage = createStorage();
  const gqlMock = vi.fn(async ({ query }) => {
    if (query === workspaceBlobQuotaQuery) {
      return quotaResponse;
    }
    if (query === createBlobUploadMutation) {
      return {
        createBlobUpload: {
          method: BlobUploadMethod.MULTIPART,
          blobKey: 'blob-key',
          alreadyUploaded: false,
          uploadId: 'upload-1',
          partSize: 2,
          uploadedParts: [],
        },
      };
    }
    if (query === getBlobUploadPartUrlQuery) {
      return {
        workspace: {
          blobUploadPartUrl: {
            uploadUrl: 'https://upload.example.com/part',
          },
        },
      };
    }
    if (query === abortBlobUploadMutation) {
      return { abortBlobUpload: true };
    }
    if (query === setBlobMutation) {
      return { setBlob: 'blob-key' };
    }
    throw new Error('Unexpected query');
  });

  vi.spyOn(storage.connection, 'gql').mockImplementation(
    gqlMock as typeof storage.connection.gql
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('', { status: 500 }))
  );

  await storage.set({
    key: 'blob-key',
    data: new Uint8Array([1, 2, 3]),
    mime: 'text/plain',
  });

  const queries = gqlMock.mock.calls.map(call => call[0].query);
  expect(queries).toContain(abortBlobUploadMutation);
  expect(queries).toContain(setBlobMutation);
});

test('uses presigned upload and completes without graphql fallback', async () => {
  const storage = createStorage();
  const gqlMock = vi.fn(async ({ query }) => {
    if (query === workspaceBlobQuotaQuery) {
      return quotaResponse;
    }
    if (query === createBlobUploadMutation) {
      return {
        createBlobUpload: {
          method: BlobUploadMethod.PRESIGNED,
          blobKey: 'blob-key',
          alreadyUploaded: false,
          uploadUrl: 'https://upload.example.com/blob',
        },
      };
    }
    if (query === completeBlobUploadMutation) {
      return { completeBlobUpload: 'blob-key' };
    }
    throw new Error('Unexpected query');
  });

  vi.spyOn(storage.connection, 'gql').mockImplementation(
    gqlMock as typeof storage.connection.gql
  );
  const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);

  await storage.set({
    key: 'blob-key',
    data: new Uint8Array([1, 2, 3]),
    mime: 'text/plain',
  });

  const queries = gqlMock.mock.calls.map(call => call[0].query);
  expect(queries).toContain(completeBlobUploadMutation);
  expect(queries).not.toContain(setBlobMutation);
  expect(fetchMock).toHaveBeenCalledWith(
    'https://upload.example.com/blob',
    expect.objectContaining({
      method: 'PUT',
    })
  );
});

test('uses multipart upload and completes without graphql fallback', async () => {
  const storage = createStorage();
  const gqlMock = vi.fn(async ({ query, variables }) => {
    if (query === workspaceBlobQuotaQuery) {
      return quotaResponse;
    }
    if (query === createBlobUploadMutation) {
      return {
        createBlobUpload: {
          method: BlobUploadMethod.MULTIPART,
          blobKey: 'blob-key',
          alreadyUploaded: false,
          uploadId: 'upload-1',
          partSize: 2,
          uploadedParts: [],
        },
      };
    }
    if (query === getBlobUploadPartUrlQuery) {
      return {
        workspace: {
          blobUploadPartUrl: {
            uploadUrl: `https://upload.example.com/part/${variables.partNumber}`,
          },
        },
      };
    }
    if (query === completeBlobUploadMutation) {
      return { completeBlobUpload: 'blob-key' };
    }
    throw new Error('Unexpected query');
  });

  vi.spyOn(storage.connection, 'gql').mockImplementation(
    gqlMock as typeof storage.connection.gql
  );
  const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => {
    const body = init?.body as ArrayBuffer;
    const length = body.byteLength;
    return new Response('', {
      status: 200,
      headers: {
        etag: `etag-${length}`,
      },
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  await storage.set({
    key: 'blob-key',
    data: new Uint8Array([1, 2, 3]),
    mime: 'text/plain',
  });

  const queries = gqlMock.mock.calls.map(call => call[0].query);
  expect(queries).toContain(getBlobUploadPartUrlQuery);
  expect(queries).toContain(completeBlobUploadMutation);
  expect(queries).not.toContain(setBlobMutation);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('downloads only through registered source-scoped V1 entries', async () => {
  const storage = createStorage();
  await expect(storage.get('blob-key')).rejects.toThrow(
    'Blob source context is required'
  );
  const first = {
    type: 'currentDoc' as const,
    workspaceId: 'workspace-1',
    docId: 'doc-1',
  };
  const second = {
    type: 'history' as const,
    workspaceId: 'workspace-1',
    docId: 'doc-2',
    timestampMs: 1720000000000,
  };
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          version: 1,
          entries: [
            { key: 'blob-key', mime: 'text/plain', size: 9, source: first },
          ],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          version: 1,
          entries: [
            { key: 'blob-key', mime: 'text/plain', size: 9, source: second },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 403,
          code: 'ACTION_FORBIDDEN',
          type: 'ACTION_FORBIDDEN',
          name: 'DOC_ACTION_DENIED',
          message: 'denied',
        }),
        { status: 403, headers: { 'content-type': 'application/json' } }
      )
    )
    .mockResolvedValueOnce(
      new Response('blob-data', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })
    )
    .mockResolvedValueOnce(
      new Response('blob-data', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })
    );
  vi.stubGlobal('fetch', fetchMock);

  await storage.registerSource(first);
  await storage.registerSource(second);
  const blob = await storage.get('blob-key');
  const retried = await storage.get('blob-key');

  expect(blob?.data).toEqual(new TextEncoder().encode('blob-data'));
  expect(retried?.data).toEqual(new TextEncoder().encode('blob-data'));
  const urls = fetchMock.mock.calls.map(call => call[0]?.toString());
  expect(urls).toMatchInlineSnapshot(`
    [
      "https://example.com/api/workspaces/workspace-1/blob-manifest/v1?sourceType=currentDoc&docId=doc-1",
      "https://example.com/api/workspaces/workspace-1/blob-manifest/v1?sourceType=history&docId=doc-2&timestampMs=1720000000000",
      "https://example.com/api/workspaces/workspace-1/blobs/v1/blob-key?sourceType=currentDoc&docId=doc-1",
      "https://example.com/api/workspaces/workspace-1/blobs/v1/blob-key?sourceType=history&docId=doc-2&timestampMs=1720000000000",
      "https://example.com/api/workspaces/workspace-1/blobs/v1/blob-key?sourceType=history&docId=doc-2&timestampMs=1720000000000",
    ]
  `);
  expect(urls.some(url => url?.includes('redirect=manual'))).toBe(false);
  await Promise.all([
    storage.unregisterSource(first),
    storage.unregisterSource(second),
  ]);
  await expect(storage.get('blob-key', undefined, second)).rejects.toThrow(
    'Blob source context is required'
  );
  expect(fetchMock).toHaveBeenCalledTimes(5);

  fetchMock
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          version: 1,
          entries: [
            { key: 'failed-blob', mime: 'text/plain', size: 1, source: second },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    .mockResolvedValueOnce(new Response('', { status: 500 }));
  await expect(
    (async () => {
      await storage.registerSource(second);
      try {
        return await storage.get('failed-blob', undefined, second);
      } finally {
        await storage.unregisterSource(second);
      }
    })()
  ).rejects.toBeDefined();
  await expect(storage.get('failed-blob', undefined, second)).rejects.toThrow(
    'Blob source context is required'
  );
  expect(fetchMock.mock.calls.slice(-2).map(call => call[0]?.toString()))
    .toMatchInlineSnapshot(`
      [
        "https://example.com/api/workspaces/workspace-1/blob-manifest/v1?sourceType=history&docId=doc-2&timestampMs=1720000000000",
        "https://example.com/api/workspaces/workspace-1/blobs/v1/failed-blob?sourceType=history&docId=doc-2&timestampMs=1720000000000",
      ]
    `);

  fetchMock
    .mockResolvedValueOnce(new Response('', { status: 500 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          version: 1,
          entries: [
            {
              key: 'recovered-blob',
              mime: 'text/plain',
              size: 9,
              source: second,
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    .mockResolvedValueOnce(
      new Response('recovered', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })
    );
  await expect(storage.registerSource(second)).rejects.toBeDefined();
  const recovered = await storage.get('recovered-blob', undefined, second);
  expect({
    data: recovered && new TextDecoder().decode(recovered.data),
    urls: fetchMock.mock.calls.slice(-3).map(call => call[0]?.toString()),
  }).toMatchInlineSnapshot(`
    {
      "data": "recovered",
      "urls": [
        "https://example.com/api/workspaces/workspace-1/blob-manifest/v1?sourceType=history&docId=doc-2&timestampMs=1720000000000",
        "https://example.com/api/workspaces/workspace-1/blob-manifest/v1?sourceType=history&docId=doc-2&timestampMs=1720000000000",
        "https://example.com/api/workspaces/workspace-1/blobs/v1/recovered-blob?sourceType=history&docId=doc-2&timestampMs=1720000000000",
      ],
    }
  `);
  await storage.unregisterSource(second);
});

test('keeps an unregistered source denied across an in-flight download', async () => {
  const storage = createStorage();
  const source = {
    type: 'currentDoc' as const,
    workspaceId: 'workspace-1',
    docId: 'doc-1',
  };
  let releaseDownload!: (response: Response) => void;
  const download = new Promise<Response>(resolve => {
    releaseDownload = resolve;
  });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          version: 1,
          entries: [{ key: 'stale', mime: 'text/plain', size: 1, source }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    .mockReturnValueOnce(download);
  vi.stubGlobal('fetch', fetchMock);

  await storage.registerSource(source);
  const reading = storage.get('stale');
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  await storage.unregisterSource(source);
  releaseDownload(
    new Response('stale-bytes', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    })
  );
  await expect(reading).resolves.toBeNull();
  await expect(storage.get('stale')).rejects.toThrow(
    'Blob source context is required'
  );
  expect(fetchMock).toHaveBeenCalledTimes(2);

  let releaseRefresh!: (response: Response) => void;
  const refreshingManifest = new Promise<Response>(resolve => {
    releaseRefresh = resolve;
  });
  fetchMock
    .mockReturnValueOnce(refreshingManifest)
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          version: 1,
          entries: [{ key: 'fresh-key', mime: 'text/plain', size: 5, source }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    .mockResolvedValueOnce(
      new Response('fresh', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })
    );
  const refresh = storage.registerSource(source);
  const dirtyRefresh = storage.registerSource(source);
  releaseRefresh(
    new Response(
      JSON.stringify({
        version: 1,
        entries: [{ key: 'stale', mime: 'text/plain', size: 1, source }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  );
  await Promise.all([refresh, dirtyRefresh]);
  await expect(storage.get('fresh-key')).resolves.toMatchObject({
    data: new TextEncoder().encode('fresh'),
  });
  expect(fetchMock).toHaveBeenCalledTimes(5);
});

test('pages readable workspace sources without workspace inventory fallback', async () => {
  const storage = createStorage();
  const source = (docId: string) => ({
    type: 'currentDoc' as const,
    workspaceId: 'workspace-1',
    docId,
  });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ version: 1, entries: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          version: 1,
          entries: [
            { key: 'one', mime: 'text/plain', size: 1, source: source('a') },
          ],
          nextCursor: 'a',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    .mockResolvedValueOnce(
      new Response('1', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          version: 1,
          entries: [
            { key: 'two', mime: 'text/plain', size: 1, source: source('b') },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
  vi.stubGlobal('fetch', fetchMock);

  await storage.registerSource(source('a'));

  const entries = storage.readableSources()[Symbol.asyncIterator]();
  await expect(entries.next()).resolves.toMatchObject({
    value: { key: 'one' },
    done: false,
  });
  await storage.unregisterSource(source('a'));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await expect(
    storage.get('one', undefined, source('a'))
  ).resolves.toMatchObject({ key: 'one' });
  await expect(entries.next()).resolves.toMatchObject({
    value: { key: 'two' },
    done: false,
  });
  expect(fetchMock).toHaveBeenCalledTimes(4);
  await expect(entries.next()).resolves.toEqual({
    value: undefined,
    done: true,
  });
  expect(fetchMock.mock.calls[3]?.[0]?.toString()).toContain('cursor=a');
  await expect(storage.get('two')).rejects.toThrow(
    'Blob source context is required'
  );
  await expect(storage.list()).rejects.toThrow(
    'Workspace blob inventory is unavailable'
  );
});

test('uses the managed workspace inventory only through its typed query', async () => {
  const storage = createStorage();
  const gqlMock = vi.fn(async ({ query }) => {
    expect(query).toBe(listBlobsQuery);
    return {
      workspace: {
        blobs: [
          {
            key: 'managed',
            mime: 'text/plain',
            size: 7,
            createdAt: '2026-08-29T00:00:00.000Z',
          },
        ],
      },
    };
  });
  vi.spyOn(storage.connection, 'gql').mockImplementation(
    gqlMock as typeof storage.connection.gql
  );

  expect(await storage.listManageable()).toEqual([
    {
      key: 'managed',
      mime: 'text/plain',
      size: 7,
      createdAt: new Date('2026-08-29T00:00:00.000Z'),
    },
  ]);
  await expect(storage.list()).rejects.toThrow(
    'Workspace blob inventory is unavailable'
  );
});

test('releases transient workspace sources and preserves owned registrations', async () => {
  const storage = createStorage();
  const source = {
    type: 'currentDoc' as const,
    workspaceId: 'workspace-1',
    docId: 'doc-1',
  };
  const entry = { key: 'stable', mime: 'text/plain', size: 4, source };
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ version: 1, entries: [entry] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          version: 1,
          entries: [{ key: 'partial', mime: 'text/plain', size: 1, source }],
          nextCursor: 'next',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    .mockResolvedValueOnce(new Response('', { status: 500 }))
    .mockResolvedValueOnce(
      new Response('keep', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ version: 1, entries: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )
    .mockResolvedValueOnce(
      new Response('keep', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      })
    );
  vi.stubGlobal('fetch', fetchMock);

  await storage.registerSource(source);
  await expect(async () => {
    for await (const _entry of storage.readableSources()) {
      // Consume until the next page fails.
    }
  }).rejects.toThrow();
  expect((await storage.get('stable'))?.data).toEqual(
    new TextEncoder().encode('keep')
  );

  for await (const _entry of storage.readableSources()) {
    // A complete empty workspace generation must also release its page state.
  }
  expect((await storage.get('stable'))?.data).toEqual(
    new TextEncoder().encode('keep')
  );
  await storage.unregisterSource(source);
  await expect(storage.get('stable')).rejects.toThrow(
    'Blob source context is required'
  );

  const registry = new BlobSourceRegistry();
  const sources = ['one', 'two', 'three'].map(docId => ({
    type: 'currentDoc' as const,
    workspaceId: 'workspace-1',
    docId,
  }));
  const record = (source: (typeof sources)[number]) => ({
    key: source.docId,
    mime: 'text/plain',
    size: 1,
    source,
  });
  registry.replaceOwned(sources[0], [record(sources[0])], {});
  registry.replaceOwned(sources[1], [record(sources[1])], {});
  registry.replaceOwned(sources[2], [record(sources[2])], {});
  expect(
    ['one', 'two', 'three'].map(key =>
      registry.candidates(key).map(candidate => candidate.source.docId)
    )
  ).toEqual([['one'], ['two'], ['three']]);
  for (let index = 0; index < 256; index++) {
    const source = {
      type: 'currentDoc' as const,
      workspaceId: 'workspace-1',
      docId: `owned-${index}`,
    };
    registry.replaceOwned(source, [record(source)], {});
  }
  expect(registry.candidates('one')).toHaveLength(1);
  registry.removeOwned(sources[1]);
  expect(registry.candidates('two')).toEqual([]);
  const released = new BlobSourceRegistry();
  for (let index = 0; index < 1000; index++) {
    const source = {
      type: 'currentDoc' as const,
      workspaceId: 'workspace-1',
      docId: `removed-${index}`,
    };
    released.replaceOwned(source, [record(source)], {});
    released.removeOwned(source);
  }
  expect(
    ['removed-0', 'removed-999'].flatMap(key => released.candidates(key))
  ).toEqual([]);

  const pendingStorage = createStorage();
  const pendingSources = Array.from({ length: 33 }, (_, index) => ({
    type: 'currentDoc' as const,
    workspaceId: 'workspace-1',
    docId: `pending-${index}`,
  }));
  const pendingFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    if (input.toString().includes('docId=pending-32')) {
      return Promise.resolve(
        new Response(JSON.stringify({ version: 1, entries: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
    }
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        'abort',
        () => reject(new DOMException('Aborted', 'AbortError')),
        { once: true }
      );
    });
  });
  vi.stubGlobal('fetch', pendingFetch);
  const pending = pendingSources
    .slice(0, 32)
    .map(source =>
      pendingStorage.registerSource(source).catch((error: unknown) => error)
    );
  const dirty = pendingStorage
    .registerSource(pendingSources[0])
    .catch((error: unknown) => error);
  const unregistering = pendingStorage.unregisterSource(pendingSources[0]);
  await expect(
    pendingStorage.registerSource(pendingSources[32])
  ).rejects.toThrow('Blob source registration budget exceeded');
  await unregistering;
  await pending[0];
  await pendingStorage.registerSource(pendingSources[32]);
  await dirty;
  const fetchCount = pendingFetch.mock.calls.length;
  await expect(
    pendingStorage.get('unregistered', undefined, pendingSources[32])
  ).rejects.toThrow('Blob source context is required');
  expect(pendingFetch).toHaveBeenCalledTimes(fetchCount + 1);
  await pendingStorage.unregisterSource(pendingSources[32]);
  await Promise.all(
    pendingSources
      .slice(1, 32)
      .map(source => pendingStorage.unregisterSource(source))
  );
  await Promise.all(pending);
});
