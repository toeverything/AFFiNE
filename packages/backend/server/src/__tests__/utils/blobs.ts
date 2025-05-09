import { type Blob } from '@prisma/client';

import { TestingApp } from './testing-app';
import { TEST_LOG_LEVEL } from './utils';

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
