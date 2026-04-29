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
