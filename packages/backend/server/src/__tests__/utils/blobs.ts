import { type Blob } from '@prisma/client';

import { TestingApp } from './testing-app';
import { TEST_LOG_LEVEL } from './utils';

export const smallestPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAIAQMAAAD+wSzIAAAABlBMVEX///+/v7+jQ3Y5AAAADklEQVQI12P4AIX8EAgALgAD/aNpbtEAAAAASUVORK5CYII';
export const smallestGif = 'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

export function createBmp(width: number, height: number) {
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;
  const buffer = Buffer.alloc(fileSize);

  buffer.write('BM', 0, 'ascii');
  buffer.writeUInt32LE(fileSize, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(pixelDataSize, 34);

  for (let y = 0; y < height; y++) {
    const rowOffset = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + x * 3;
      buffer[pixelOffset] = 0x33;
      buffer[pixelOffset + 1] = 0x66;
      buffer[pixelOffset + 2] = 0x99;
    }
  }

  return buffer;
}

export async function listBlobs(
  app: TestingApp,
  workspaceId: string
): Promise<Blob[]> {
  const res = await app.gql(`
    query {
      workspace(id: "${workspaceId}") {
        blobs {
          key
          mime
          size
          createdAt
        }
      }
    }
  `);
  return res.workspace.blobs;
}

export async function getWorkspaceBlobsSize(
  app: TestingApp,
  workspaceId: string
): Promise<number> {
  const res = await app.gql(`
    query {
      workspace(id: "${workspaceId}") {
        blobsSize
      }
    }
  `);
  return res.workspace.blobsSize;
}

export async function collectAllBlobSizes(app: TestingApp): Promise<number> {
  const res = await app.gql(`
    query {
      currentUser {
        quotaUsage {
          storageQuota
        }
      }
    }
  `);
  return res.currentUser.quotaUsage.storageQuota;
}

export async function setBlob(
  app: TestingApp,
  workspaceId: string,
  buffer: Buffer
): Promise<string> {
  const res = await app
    .POST('/graphql')
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .field(
      'operations',
      JSON.stringify({
        name: 'setBlob',
        query: `mutation setBlob($blob: Upload!) {
              setBlob(workspaceId: "${workspaceId}", blob: $blob)
            }`,
        variables: { blob: null },
      })
    )
    .field('map', JSON.stringify({ '0': ['variables.blob'] }))
    .attach(
      '0',
      buffer,
      `blob-${Math.random().toString(16).substring(2, 10)}.data`
    )
    .expect(200);

  if (res.body.errors?.length) {
    if (TEST_LOG_LEVEL !== 'fatal') {
      // print the error stack when log level is not fatal, for better debugging
      console.error('%o', res.body);
    }
    throw new Error(res.body.errors[0].message);
  }
  return res.body.data.setBlob;
}

export async function createBlobUpload(
  app: TestingApp,
  workspaceId: string,
  key: string,
  size: number,
  mime: string
) {
  const res = await app.gql(
    `
      mutation createBlobUpload($workspaceId: String!, $key: String!, $size: Int!, $mime: String!) {
        createBlobUpload(workspaceId: $workspaceId, key: $key, size: $size, mime: $mime) {
          method
          blobKey
          uploadUrl
          uploadId
          partSize
        }
      }
    `,
    {
      workspaceId,
      key,
      size,
      mime,
    }
  );
  return res.createBlobUpload;
}

export async function completeBlobUpload(
  app: TestingApp,
  workspaceId: string,
  key: string,
  options?: {
    uploadId?: string;
    parts?: { partNumber: number; etag: string }[];
  }
) {
  const res = await app.gql(
    `
      mutation completeBlobUpload($workspaceId: String!, $key: String!, $uploadId: String, $parts: [BlobUploadPartInput!]) {
        completeBlobUpload(workspaceId: $workspaceId, key: $key, uploadId: $uploadId, parts: $parts)
      }
    `,
    {
      workspaceId,
      key,
      uploadId: options?.uploadId,
      parts: options?.parts,
    }
  );
  return res.completeBlobUpload;
}

export async function getBlobUploadPartUrl(
  app: TestingApp,
  workspaceId: string,
  key: string,
  uploadId: string,
  partNumber: number
) {
  const res = await app.gql(
    `
      query getBlobUploadPartUrl($workspaceId: String!, $key: String!, $uploadId: String!, $partNumber: Int!) {
        workspace(id: $workspaceId) {
          blobUploadPartUrl(key: $key, uploadId: $uploadId, partNumber: $partNumber) {
            uploadUrl
            headers
            expiresAt
          }
        }
      }
    `,
    {
      workspaceId,
      key,
      uploadId,
      partNumber,
    }
  );
  return res.workspace.blobUploadPartUrl;
}
