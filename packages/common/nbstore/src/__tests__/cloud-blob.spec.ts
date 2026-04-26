import {
  abortBlobUploadMutation,
  BlobUploadMethod,
  completeBlobUploadMutation,
  createBlobUploadMutation,
  getBlobUploadPartUrlQuery,
  setBlobMutation,
  workspaceBlobQuotaQuery,
} from '@affine/graphql';
import { afterEach, expect, test, vi } from 'vitest';

import { BlobFrontend } from '../frontend/blob';
import { CloudBlobStorage } from '../impls/cloud/blob';

const originalBuildConfig = (globalThis as any).BUILD_CONFIG;
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
  (globalThis as any).BUILD_CONFIG = originalBuildConfig;
});

function createStorage() {
  return new CloudBlobStorage({
    serverBaseUrl: 'https://example.com',
    id: 'workspace-1',
  });
}

function createAnonymousStorage() {
  return new CloudBlobStorage({
    serverBaseUrl: 'https://example.com',
    id: 'workspace-1',
    anonymousGuestToken: 'guest-token',
    anonymousDocId: 'doc-1',
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

  (storage.connection as any).gql = gqlMock;

  await storage.set({
    key: 'blob-key',
    data: new Uint8Array([1, 2, 3]),
    mime: 'text/plain',
  });

  const queries = gqlMock.mock.calls.map(call => call[0].query);
  expect(queries).toContain(createBlobUploadMutation);
  expect(queries).toContain(setBlobMutation);
});

test('anonymous upload skips user quota query and namespaces blob key', async () => {
  const storage = createAnonymousStorage();
  const gqlMock = vi.fn(async ({ query, variables }) => {
    if (query === workspaceBlobQuotaQuery) {
      throw new Error('Anonymous upload should not query user quota');
    }
    if (query === createBlobUploadMutation) {
      expect(variables.key).toBe('anonymous-doc/doc-1/blob-key');
      expect(variables.anonymousGuestToken).toBe('guest-token');
      return {
        createBlobUpload: {
          method: BlobUploadMethod.GRAPHQL,
          blobKey: 'anonymous-doc/doc-1/blob-key',
          alreadyUploaded: false,
        },
      };
    }
    if (query === setBlobMutation) {
      expect(variables.blob.name).toBe('anonymous-doc/doc-1/blob-key');
      expect(variables.anonymousGuestToken).toBe('guest-token');
      return { setBlob: 'anonymous-doc/doc-1/blob-key' };
    }
    throw new Error('Unexpected query');
  });

  (storage.connection as any).gql = gqlMock;

  await storage.set({
    key: 'blob-key',
    data: new Uint8Array([1, 2, 3]),
    mime: 'text/plain',
  });

  expect(gqlMock).not.toHaveBeenCalledWith(
    expect.objectContaining({ query: workspaceBlobQuotaQuery })
  );
});

test('anonymous download keeps document blob key', async () => {
  const storage = createAnonymousStorage();
  const fetchMock = vi.fn().mockResolvedValueOnce(
    new Response('blob-data', {
      status: 200,
      headers: {
        'content-type': 'text/plain',
        'last-modified': new Date('2026-01-01').toUTCString(),
      },
    })
  );
  vi.stubGlobal('fetch', fetchMock);

  const blob = await storage.get('admin-uploaded-blob');

  expect(blob?.data).toEqual(new TextEncoder().encode('blob-data'));
  expect(fetchMock.mock.calls[0]?.[0]?.toString()).toBe(
    'https://example.com/api/workspaces/workspace-1/blobs/admin-uploaded-blob'
  );
  expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
    'x-affine-anonymous-guest-token': 'guest-token',
  });
});

test('blob frontend returns storage key for document references', async () => {
  const setMock = vi.fn();
  const uploadMock = vi.fn(async () => true);
  const frontend = new BlobFrontend(
    {
      storageType: 'blob',
      isReadonly: false,
      connection: {
        waitForConnected: async () => {},
      },
      storageKey: (key: string) => `anonymous-doc/doc-1/${key}`,
      get: async () => null,
      set: setMock,
      delete: async () => {},
      release: async () => {},
      list: async () => [],
    } as any,
    {
      ['state$']: null as any,
      ['blobState$']: () => null as any,
      uploadBlob: uploadMock,
      downloadBlob: async () => false,
      fullDownload: async () => {},
      waitForConnected: async () => {},
      connection: null as any,
    } as any
  );

  const storedKey = await frontend.set({
    key: 'blob-key',
    data: new Uint8Array([1]),
    mime: 'text/plain',
  });

  expect(storedKey).toBe('anonymous-doc/doc-1/blob-key');
  expect(setMock).toHaveBeenCalledWith(
    expect.objectContaining({ key: 'anonymous-doc/doc-1/blob-key' })
  );
  expect(uploadMock).toHaveBeenCalledWith(
    expect.objectContaining({ key: 'anonymous-doc/doc-1/blob-key' }),
    true
  );
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

  (storage.connection as any).gql = gqlMock;
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

  (storage.connection as any).gql = gqlMock;
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

  (storage.connection as any).gql = gqlMock;
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

  (storage.connection as any).gql = gqlMock;
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

test('uses manual redirect when downloading blobs on mobile', async () => {
  (globalThis as any).BUILD_CONFIG = {
    ...originalBuildConfig,
    appVersion: 'test',
    isAndroid: true,
    isIOS: false,
    isElectron: false,
  };

  vi.resetModules();
  const { CloudBlobStorage: MobileCloudBlobStorage } =
    await import('../impls/cloud/blob');
  const storage = new MobileCloudBlobStorage({
    serverBaseUrl: 'https://example.com',
    id: 'workspace-1',
  });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ url: 'https://cdn.example.com/blob-key' }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        }
      )
    )
    .mockResolvedValueOnce(
      new Response('blob-data', {
        status: 200,
        headers: {
          'content-type': 'text/plain',
        },
      })
    );
  vi.stubGlobal('fetch', fetchMock);

  const blob = await storage.get('blob-key');

  expect(blob?.data).toEqual(new TextEncoder().encode('blob-data'));
  expect(fetchMock.mock.calls[0]?.[0]?.toString()).toBe(
    'https://example.com/api/workspaces/workspace-1/blobs/blob-key?redirect=manual'
  );
  expect(fetchMock.mock.calls[1]?.[0]?.toString()).toBe(
    'https://cdn.example.com/blob-key'
  );
});
