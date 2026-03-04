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
