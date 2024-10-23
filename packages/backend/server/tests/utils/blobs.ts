import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { gql } from './common';

export async function listBlobs(
  app: INestApplication,
  token: string,
  workspaceId: string
): Promise<string[]> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .set({ 'x-request-id': 'test', 'x-operation-name': 'test' })
    .send({
      query: `
            query {
              listBlobs(workspaceId: "${workspaceId}")
            }
          `,
    })
    .expect(200);
  return res.body.data.listBlobs;
}

export async function getWorkspaceBlobsSize(
  app: INestApplication,
  token: string,
  workspaceId: string
): Promise<number> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .send({
      query: `
              query {
                workspace(id: "${workspaceId}") {
                  blobsSize
                }
              }
            `,
    })
    .expect(200);
  return res.body.data.workspace.blobsSize;
}

export async function collectAllBlobSizes(
  app: INestApplication,
  token: string
): Promise<number> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
    .send({
      query: `
              query {
                currentUser {
                  quotaUsage {
                    storageQuota
                  }
                }
              }
            `,
    })
    .expect(200);
  return res.body.data.currentUser.quotaUsage.storageQuota;
}

export async function setBlob(
  app: INestApplication,
  token: string,
  workspaceId: string,
  buffer: Buffer
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post(gql)
    .auth(token, { type: 'bearer' })
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
  return res.body.data.setBlob;
}
