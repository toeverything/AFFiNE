import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { io, type Socket } from 'socket.io-client';
import { describe, expect, it } from 'vitest';
import { applyUpdate, Doc as YDoc, encodeStateAsUpdate } from 'yjs';

import { listenTestApp, startTestApp } from '../helpers/app.js';
import { cookieHeader } from '../helpers/cookies.js';

const CREATE = `mutation createWorkspace {
  createWorkspace { id public createdAt }
}`;

const CREATE_UPLOAD = `mutation createBlobUpload($workspaceId: String!, $key: String!, $size: Int!, $mime: String!) {
  createBlobUpload(workspaceId: $workspaceId, key: $key, size: $size, mime: $mime) {
    method blobKey alreadyUploaded uploadUrl
  }
}`;

const COMPLETE_UPLOAD = `mutation completeBlobUpload($workspaceId: String!, $key: String!) {
  completeBlobUpload(workspaceId: $workspaceId, key: $key)
}`;

const LIST_BLOBS = `query listBlobs($workspaceId: String!) {
  workspace(id: $workspaceId) {
    blobs { key size }
  }
}`;

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
  0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44,
  0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x03, 0x00,
  0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

async function gql(
  app: Awaited<ReturnType<typeof startTestApp>>['app'],
  cookies: string,
  query: string,
  variables: Record<string, unknown>,
  operationName: string
) {
  return app.inject({
    method: 'POST',
    url: '/graphql',
    headers: {
      'content-type': 'application/json',
      cookie: cookies,
      'x-operation-name': operationName,
    },
    payload: { query, variables, operationName },
  });
}

async function signIn(
  app: Awaited<ReturnType<typeof startTestApp>>['app'],
  email: string
) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in',
    headers: { 'content-type': 'application/json' },
    payload: { email, password: 'correcthorse' },
  });
  expect(res.statusCode).toBe(200);
  return cookieHeader(res);
}

async function createWorkspace(
  app: Awaited<ReturnType<typeof startTestApp>>['app'],
  cookies: string
) {
  const res = await gql(app, cookies, CREATE, {}, 'createWorkspace');
  const body = res.json() as { data: { createWorkspace: { id: string } } };
  return body.data.createWorkspace.id;
}

function connect(url: string, cookie: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(url, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      extraHeaders: { cookie },
      reconnection: false,
      timeout: 5000,
      forceNew: true,
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('socket connect timeout'));
    }, 8_000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function joinSpace(socket: Socket, spaceId: string, docId: string) {
  return (await socket.timeout(8_000).emitWithAck('space:join-batch', {
    spaces: [{ spaceType: 'workspace', spaceId, docId }],
    clientVersion: '0.27.5',
  })) as { data?: { success: boolean }; error?: { name: string } };
}

function mapUpdate(key: string, value: string): Uint8Array {
  const doc = new YDoc();
  doc.getMap('root').set(key, value);
  return encodeStateAsUpdate(doc);
}

describe('Phase 5 — Cutover E2E', () => {
  it('login → create board → two-client collab → blob → reload', async () => {
    const { app, url } = await listenTestApp();
    const cookies = await signIn(app, 'cutover@example.com');
    const spaceId = await createWorkspace(app, cookies);
    const docId = spaceId;

    const a = await connect(url, cookies);
    const b = await connect(url, cookies);
    expect((await joinSpace(a, spaceId, docId)).data?.success).toBe(true);
    expect((await joinSpace(b, spaceId, docId)).data?.success).toBe(true);

    const fromB = new Promise<void>(resolve => {
      b.once('space:broadcast-doc-updates', () => resolve());
    });
    const ua = mapUpdate('title', 'board');
    const pushA = (await a.emitWithAck('space:push-doc-update', {
      spaceType: 'workspace',
      spaceId,
      docId,
      update: Buffer.from(ua).toString('base64'),
    })) as { data?: { timestamp: number } };
    expect(pushA.data?.timestamp).toBeGreaterThan(0);
    await fromB;

    const ub = mapUpdate('widget', 'sketch');
    await b.emitWithAck('space:push-doc-update', {
      spaceType: 'workspace',
      spaceId,
      docId,
      update: Buffer.from(ub).toString('base64'),
    });

    const created = await gql(
      app,
      cookies,
      CREATE_UPLOAD,
      {
        workspaceId: spaceId,
        key: 'board-snapshot',
        size: PNG.byteLength,
        mime: 'image/png',
      },
      'createBlobUpload'
    );
    const uploadUrl = (
      created.json() as { data: { createBlobUpload: { uploadUrl: string } } }
    ).data.createBlobUpload.uploadUrl;
    const put = await app.inject({
      method: 'PUT',
      url: uploadUrl,
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.from(PNG),
    });
    expect(put.statusCode).toBe(200);
    const done = await gql(
      app,
      cookies,
      COMPLETE_UPLOAD,
      { workspaceId: spaceId, key: 'board-snapshot' },
      'completeBlobUpload'
    );
    expect(done.json()).toMatchObject({
      data: { completeBlobUpload: 'board-snapshot' },
    });

    a.disconnect();
    b.disconnect();

    const reloaded = await connect(url, cookies);
    expect((await joinSpace(reloaded, spaceId, docId)).data?.success).toBe(
      true
    );
    const loaded = (await reloaded.emitWithAck('space:load-doc', {
      spaceType: 'workspace',
      spaceId,
      docId,
    })) as { data: { missing: string } };
    const merged = new YDoc();
    applyUpdate(merged, Buffer.from(loaded.data.missing, 'base64'));
    expect(merged.getMap('root').toJSON()).toMatchObject({
      title: 'board',
      widget: 'sketch',
    });
    reloaded.disconnect();

    const blob = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${spaceId}/blobs/v1/board-snapshot?sourceType=currentDoc&docId=${docId}`,
      headers: { cookie: cookies },
    });
    expect(blob.statusCode).toBe(200);
    expect(Uint8Array.from(blob.rawPayload)).toEqual(PNG);

    const listed = await gql(
      app,
      cookies,
      LIST_BLOBS,
      { workspaceId: spaceId },
      'listBlobs'
    );
    const keys = (
      listed.json() as {
        data: { workspace: { blobs: Array<{ key: string }> } };
      }
    ).data.workspace.blobs.map(entry => entry.key);
    expect(keys).toContain('board-snapshot');
  });

  it('does not advertise Payment, Copilot, or mosaic on GraphQL serverConfig', async () => {
    const { app } = await startTestApp({
      MOSAIC_FEATURES: ['mosaic', 'Payment', 'Copilot', 'CopilotEmbedding'],
    });
    const res = await app.inject({
      method: 'POST',
      url: '/graphql',
      headers: {
        'content-type': 'application/json',
        'x-operation-name': 'serverConfig',
      },
      payload: { query: 'query { serverConfig { features } }' },
    });
    const features = (
      res.json() as { data: { serverConfig: { features: string[] } } }
    ).data.serverConfig.features;
    expect(features).toContain('Comment');
    expect(features).not.toContain('mosaic');
    expect(features).not.toContain('Payment');
    expect(features).not.toContain('Copilot');
    expect(features).not.toContain('CopilotEmbedding');
  });

  it('serves the MIT SPA from MOSAIC_STATIC_DIR without stealing API routes', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mosaic-static-'));
    await writeFile(
      join(dir, 'selfhost.html'),
      '<!doctype html><title>Mosaic selfhost</title>',
      'utf8'
    );
    await writeFile(join(dir, 'app.js'), 'window.MOSAIC=1;', 'utf8');

    const { app } = await startTestApp({ MOSAIC_STATIC_DIR: dir });

    const index = await app.inject({ method: 'GET', url: '/' });
    expect(index.statusCode).toBe(200);
    expect(index.headers['content-type']).toMatch(/text\/html/);
    expect(index.body).toContain('Mosaic selfhost');

    const spa = await app.inject({ method: 'GET', url: '/workspace/abc' });
    expect(spa.statusCode).toBe(200);
    expect(spa.body).toContain('Mosaic selfhost');

    const asset = await app.inject({ method: 'GET', url: '/app.js' });
    expect(asset.statusCode).toBe(200);
    expect(asset.body).toContain('window.MOSAIC=1');

    const missingAsset = await app.inject({ method: 'GET', url: '/nope.js' });
    expect(missingAsset.statusCode).toBe(404);
    expect(missingAsset.json()).toMatchObject({ error: 'not_found' });

    const info = await app.inject({ method: 'GET', url: '/info' });
    expect(info.statusCode).toBe(200);
    expect(info.json()).toMatchObject({ name: 'Mosaic', type: 'selfhosted' });

    const cookies = await signIn(app, 'static-spa@example.com');
    const gqlRes = await gql(app, cookies, CREATE, {}, 'createWorkspace');
    expect(gqlRes.statusCode).toBe(200);
    expect(
      (gqlRes.json() as { data: { createWorkspace: { id: string } } }).data
        .createWorkspace.id
    ).toBeTruthy();
  });
});
