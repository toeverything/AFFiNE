import { describe, expect, it } from 'vitest';
import { applyUpdate, Doc as YDoc } from 'yjs';

import { listenTestApp, startTestApp } from '../helpers/app.js';
import { cookieHeader } from '../helpers/cookies.js';

const CREATE_WORKSPACE = `mutation createWorkspace {
  createWorkspace { id }
}`;

const CREATE_UPLOAD = `mutation createBlobUpload($workspaceId: String!, $key: String!, $size: Int!, $mime: String!) {
  createBlobUpload(workspaceId: $workspaceId, key: $key, size: $size, mime: $mime) {
    method blobKey alreadyUploaded uploadUrl uploadId partSize
  }
}`;

const COMPLETE_UPLOAD = `mutation completeBlobUpload($workspaceId: String!, $key: String!, $uploadId: String, $parts: [BlobUploadPartInput!]) {
  completeBlobUpload(workspaceId: $workspaceId, key: $key, uploadId: $uploadId, parts: $parts)
}`;

const LIST_BLOBS = `query listBlobs($workspaceId: String!) {
  workspace(id: $workspaceId) {
    blobs { key size mime createdAt }
    quota { blobLimit humanReadable { blobLimit } }
  }
}`;

const DELETE_BLOB = `mutation deleteBlob($workspaceId: String!, $key: String!, $permanently: Boolean) {
  deleteBlob(workspaceId: $workspaceId, key: $key, permanently: $permanently)
}`;

const RELEASE = `mutation releaseDeletedBlobs($workspaceId: String!) {
  releaseDeletedBlobs(workspaceId: $workspaceId)
}`;

const PART_URL = `query getBlobUploadPartUrl($workspaceId: String!, $key: String!, $uploadId: String!, $partNumber: Int!) {
  workspace(id: $workspaceId) {
    blobUploadPartUrl(key: $key, uploadId: $uploadId, partNumber: $partNumber) {
      uploadUrl
    }
  }
}`;

const LIST_HISTORY = `query listHistory($workspaceId: String!, $pageDocId: String!) {
  workspace(id: $workspaceId) {
    histories(guid: $pageDocId, take: 10) {
      id timestamp editor { name }
    }
  }
}`;

const RECOVER = `mutation recoverDoc($workspaceId: String!, $docId: String!, $timestamp: DateTime!) {
  recoverDoc(workspaceId: $workspaceId, guid: $docId, timestamp: $timestamp)
}`;

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
  0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44,
  0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x03, 0x00,
  0x01, 0x00, 0x05, 0xfe, 0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

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

async function gql(
  app: Awaited<ReturnType<typeof startTestApp>>['app'],
  cookies: string,
  query: string,
  variables: Record<string, unknown>,
  operationName: string
) {
  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: {
      'content-type': 'application/json',
      cookie: cookies,
      'x-operation-name': operationName,
    },
    payload: { query, variables, operationName },
  });
  return res;
}

async function createWorkspace(
  app: Awaited<ReturnType<typeof startTestApp>>['app'],
  cookies: string
) {
  const res = await gql(app, cookies, CREATE_WORKSPACE, {}, 'createWorkspace');
  const body = res.json() as { data: { createWorkspace: { id: string } } };
  return body.data.createWorkspace.id;
}

describe('Phase 3 — Blobs + Doc meta', () => {
  it('routes GET blob v1 with ACL (401 when logged out)', async () => {
    const { app } = await startTestApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/workspaces/ws-1/blobs/v1/blob-key?sourceType=currentDoc&docId=doc-1',
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { error?: string; name?: string };
    expect(body.error).not.toBe('not_found');
    expect(body.name).toBe('AUTHENTICATION_REQUIRED');
  });

  it('uploads a chart/sketch PNG via presigned PUT and serves it', async () => {
    const { app } = await startTestApp();
    const cookies = await signIn(app, 'blob@example.com');
    const spaceId = await createWorkspace(app, cookies);
    const created = await gql(
      app,
      cookies,
      CREATE_UPLOAD,
      {
        workspaceId: spaceId,
        key: 'sketch-1',
        size: PNG.byteLength,
        mime: 'application/octet-stream',
      },
      'createBlobUpload'
    );
    const init = created.json() as {
      data: {
        createBlobUpload: {
          alreadyUploaded: boolean;
          method: string;
          uploadUrl: string;
        };
      };
    };
    expect(init.data.createBlobUpload.alreadyUploaded).toBe(false);
    expect(init.data.createBlobUpload.method).toBe('PRESIGNED');
    const put = await app.inject({
      method: 'PUT',
      url: init.data.createBlobUpload.uploadUrl,
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.from(PNG),
    });
    expect(put.statusCode).toBe(200);
    expect(put.headers.etag).toBeTruthy();
    const done = await gql(
      app,
      cookies,
      COMPLETE_UPLOAD,
      { workspaceId: spaceId, key: 'sketch-1' },
      'completeBlobUpload'
    );
    expect(done.json()).toMatchObject({
      data: { completeBlobUpload: 'sketch-1' },
    });

    const download = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${spaceId}/blobs/v1/sketch-1?sourceType=currentDoc&docId=page-1`,
      headers: { cookie: cookies },
    });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toBe('image/png');
    expect(Uint8Array.from(download.rawPayload)).toEqual(PNG);

    const manifest = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${spaceId}/blob-manifest/v1?sourceType=currentDoc&docId=page-1`,
      headers: { cookie: cookies },
    });
    expect(manifest.statusCode).toBe(200);
    const body = manifest.json() as {
      version: number;
      entries: Array<{ key: string; mime: string; source: { type: string } }>;
    };
    expect(body.version).toBe(1);
    expect(
      body.entries.some(
        entry => entry.key === 'sketch-1' && entry.mime === 'image/png'
      )
    ).toBe(true);
  });

  it('short-circuits createBlobUpload when the key already exists', async () => {
    const { app } = await startTestApp();
    const cookies = await signIn(app, 'idem-blob@example.com');
    const spaceId = await createWorkspace(app, cookies);
    const first = await gql(
      app,
      cookies,
      CREATE_UPLOAD,
      {
        workspaceId: spaceId,
        key: 'once',
        size: PNG.byteLength,
        mime: 'image/png',
      },
      'createBlobUpload'
    );
    const url = (
      first.json() as { data: { createBlobUpload: { uploadUrl: string } } }
    ).data.createBlobUpload.uploadUrl;
    await app.inject({
      method: 'PUT',
      url,
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.from(PNG),
    });
    await gql(
      app,
      cookies,
      COMPLETE_UPLOAD,
      { workspaceId: spaceId, key: 'once' },
      'completeBlobUpload'
    );
    const again = await gql(
      app,
      cookies,
      CREATE_UPLOAD,
      {
        workspaceId: spaceId,
        key: 'once',
        size: PNG.byteLength,
        mime: 'image/png',
      },
      'createBlobUpload'
    );
    expect(again.json()).toMatchObject({
      data: { createBlobUpload: { alreadyUploaded: true } },
    });
  });

  it('denies blob access across workspaces', async () => {
    const { app } = await startTestApp();
    const owner = await signIn(app, 'owner-blob@example.com');
    const spaceId = await createWorkspace(app, owner);
    const created = await gql(
      app,
      owner,
      CREATE_UPLOAD,
      {
        workspaceId: spaceId,
        key: 'secret',
        size: PNG.byteLength,
        mime: 'image/png',
      },
      'createBlobUpload'
    );
    const url = (
      created.json() as { data: { createBlobUpload: { uploadUrl: string } } }
    ).data.createBlobUpload.uploadUrl;
    await app.inject({
      method: 'PUT',
      url,
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.from(PNG),
    });
    await gql(
      app,
      owner,
      COMPLETE_UPLOAD,
      { workspaceId: spaceId, key: 'secret' },
      'completeBlobUpload'
    );
    const stranger = await signIn(app, 'stranger-blob@example.com');
    const res = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${spaceId}/blobs/v1/secret?sourceType=page&docId=doc-1`,
      headers: { cookie: stranger },
    });
    expect(res.statusCode).toBe(403);
  });

  it('lists, soft-deletes, and releases blobs', async () => {
    const { app } = await startTestApp();
    const cookies = await signIn(app, 'gc-blob@example.com');
    const spaceId = await createWorkspace(app, cookies);
    const created = await gql(
      app,
      cookies,
      CREATE_UPLOAD,
      {
        workspaceId: spaceId,
        key: 'tmp',
        size: PNG.byteLength,
        mime: 'image/png',
      },
      'createBlobUpload'
    );
    const url = (
      created.json() as { data: { createBlobUpload: { uploadUrl: string } } }
    ).data.createBlobUpload.uploadUrl;
    await app.inject({
      method: 'PUT',
      url,
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.from(PNG),
    });
    await gql(
      app,
      cookies,
      COMPLETE_UPLOAD,
      { workspaceId: spaceId, key: 'tmp' },
      'completeBlobUpload'
    );
    const listed = await gql(
      app,
      cookies,
      LIST_BLOBS,
      { workspaceId: spaceId },
      'listBlobs'
    );
    const listedBody = listed.json() as {
      data: {
        workspace: {
          blobs: Array<{ key: string }>;
          quota: { blobLimit: number };
        };
      };
    };
    expect(listedBody.data.workspace.blobs.map(blob => blob.key)).toContain(
      'tmp'
    );
    expect(listedBody.data.workspace.quota.blobLimit).toBeGreaterThan(0);
    await gql(
      app,
      cookies,
      DELETE_BLOB,
      { workspaceId: spaceId, key: 'tmp', permanently: false },
      'deleteBlob'
    );
    const afterDelete = await gql(
      app,
      cookies,
      LIST_BLOBS,
      { workspaceId: spaceId },
      'listBlobs'
    );
    expect(
      (
        afterDelete.json() as {
          data: { workspace: { blobs: Array<{ key: string }> } };
        }
      ).data.workspace.blobs
    ).toHaveLength(0);
    await gql(
      app,
      cookies,
      RELEASE,
      { workspaceId: spaceId },
      'releaseDeletedBlobs'
    );
  });

  it('uploads via multipart parts', async () => {
    const { app } = await startTestApp({
      BLOB_MULTIPART_THRESHOLD: 8,
      BLOB_PART_SIZE: 8,
    });
    const cookies = await signIn(app, 'multi@example.com');
    const spaceId = await createWorkspace(app, cookies);
    const payload = Uint8Array.from({ length: 20 }, (_, index) => index + 1);
    const created = await gql(
      app,
      cookies,
      CREATE_UPLOAD,
      {
        workspaceId: spaceId,
        key: 'chunked',
        size: payload.byteLength,
        mime: 'application/octet-stream',
      },
      'createBlobUpload'
    );
    const init = created.json() as {
      data: {
        createBlobUpload: {
          method: string;
          uploadId: string;
          partSize: number;
        };
      };
    };
    expect(init.data.createBlobUpload.method).toBe('MULTIPART');
    const partSize = init.data.createBlobUpload.partSize;
    const uploadId = init.data.createBlobUpload.uploadId;
    const parts: Array<{ partNumber: number; etag: string }> = [];
    const totalParts = Math.ceil(payload.byteLength / partSize);
    for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
      const part = await gql(
        app,
        cookies,
        PART_URL,
        { workspaceId: spaceId, key: 'chunked', uploadId, partNumber },
        'getBlobUploadPartUrl'
      );
      const uploadUrl = (
        part.json() as {
          data: { workspace: { blobUploadPartUrl: { uploadUrl: string } } };
        }
      ).data.workspace.blobUploadPartUrl.uploadUrl;
      const start = (partNumber - 1) * partSize;
      const chunk = payload.subarray(start, start + partSize);
      const put = await app.inject({
        method: 'PUT',
        url: uploadUrl,
        headers: { 'content-type': 'application/octet-stream' },
        payload: Buffer.from(chunk),
      });
      expect(put.statusCode).toBe(200);
      parts.push({ partNumber, etag: String(put.headers.etag) });
    }
    const done = await gql(
      app,
      cookies,
      COMPLETE_UPLOAD,
      { workspaceId: spaceId, key: 'chunked', uploadId, parts },
      'completeBlobUpload'
    );
    expect(done.json()).toMatchObject({
      data: { completeBlobUpload: 'chunked' },
    });
    const download = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${spaceId}/blobs/v1/chunked?sourceType=currentDoc&docId=doc`,
      headers: { cookie: cookies },
    });
    expect(Uint8Array.from(download.rawPayload)).toEqual(payload);
  });

  it('rejects blobs over the size quota', async () => {
    const { app } = await startTestApp({ BLOB_MAX_BYTES: 16 });
    const cookies = await signIn(app, 'huge@example.com');
    const spaceId = await createWorkspace(app, cookies);
    const res = await gql(
      app,
      cookies,
      CREATE_UPLOAD,
      {
        workspaceId: spaceId,
        key: 'huge',
        size: 64,
        mime: 'application/octet-stream',
      },
      'createBlobUpload'
    );
    const body = res.json() as {
      errors?: Array<{ extensions?: { name?: string } }>;
    };
    expect(body.errors?.[0]?.extensions?.name).toBe('BLOB_QUOTA_EXCEEDED');
  });

  it('re-checks the storage quota at commit time, closing the concurrent-upload bypass', async () => {
    const { app } = await startTestApp({ BLOB_STORAGE_QUOTA_BYTES: 20 });
    const cookies = await signIn(app, 'quota-race@example.com');
    const spaceId = await createWorkspace(app, cookies);
    const payloadA = Uint8Array.from({ length: 15 }, () => 1);
    const payloadB = Uint8Array.from({ length: 15 }, () => 2);

    // Both createBlobUpload calls succeed: individually each fits under the
    // 20-byte quota (neither has committed bytes yet, so usedStorage() is
    // still 0 for both pre-flight checks).
    const initA = await gql(
      app,
      cookies,
      CREATE_UPLOAD,
      {
        workspaceId: spaceId,
        key: 'race-a',
        size: payloadA.byteLength,
        mime: 'application/octet-stream',
      },
      'createBlobUpload'
    );
    const initB = await gql(
      app,
      cookies,
      CREATE_UPLOAD,
      {
        workspaceId: spaceId,
        key: 'race-b',
        size: payloadB.byteLength,
        mime: 'application/octet-stream',
      },
      'createBlobUpload'
    );
    const urlA = (
      initA.json() as { data: { createBlobUpload: { uploadUrl: string } } }
    ).data.createBlobUpload.uploadUrl;
    const urlB = (
      initB.json() as { data: { createBlobUpload: { uploadUrl: string } } }
    ).data.createBlobUpload.uploadUrl;

    await app.inject({
      method: 'PUT',
      url: urlA,
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.from(payloadA),
    });
    await app.inject({
      method: 'PUT',
      url: urlB,
      headers: { 'content-type': 'application/octet-stream' },
      payload: Buffer.from(payloadB),
    });

    const doneA = await gql(
      app,
      cookies,
      COMPLETE_UPLOAD,
      { workspaceId: spaceId, key: 'race-a' },
      'completeBlobUpload'
    );
    expect(doneA.json()).toMatchObject({
      data: { completeBlobUpload: 'race-a' },
    });

    // Completing the second upload would push total usage to 30 bytes,
    // over the 20-byte quota: it must be rejected at commit time even
    // though its own createBlobUpload pre-check already passed.
    const doneB = await gql(
      app,
      cookies,
      COMPLETE_UPLOAD,
      { workspaceId: spaceId, key: 'race-b' },
      'completeBlobUpload'
    );
    const bodyB = doneB.json() as {
      errors?: Array<{ extensions?: { name?: string } }>;
    };
    expect(bodyB.errors?.[0]?.extensions?.name).toBe('STORAGE_QUOTA_EXCEEDED');
  });

  it('records compact history and restores it', async () => {
    const { app, url } = await listenTestApp({ SYNC_COMPACT_UPDATES: 1 });
    const cookies = await signIn(app, 'history@example.com');
    const spaceId = await createWorkspace(app, cookies);
    const { io } = await import('socket.io-client');
    const { encodeStateAsUpdate } = await import('yjs');
    const socket = io(url, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      extraHeaders: { cookie: cookies },
      reconnection: false,
      forceNew: true,
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    await socket.timeout(8_000).emitWithAck('space:join-batch', {
      spaces: [{ spaceType: 'workspace', spaceId, docId: 'page' }],
      clientVersion: '0.27.5',
    });
    const doc = new YDoc();
    doc.getMap('root').set('k', 'v1');
    await socket.timeout(8_000).emitWithAck('space:push-doc-update', {
      spaceType: 'workspace',
      spaceId,
      docId: 'page',
      update: Buffer.from(encodeStateAsUpdate(doc)).toString('base64'),
    });
    const listed = await gql(
      app,
      cookies,
      LIST_HISTORY,
      { workspaceId: spaceId, pageDocId: 'page' },
      'listHistory'
    );
    const histories = (
      listed.json() as {
        data: { workspace: { histories: Array<{ timestamp: string }> } };
      }
    ).data.workspace.histories;
    expect(histories.length).toBeGreaterThan(0);
    const ts = new Date(histories[0]!.timestamp).getTime();
    const snap = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${spaceId}/docs/page/histories/${ts}`,
      headers: { cookie: cookies },
    });
    expect(snap.statusCode).toBe(200);
    const ydoc = new YDoc();
    applyUpdate(ydoc, Uint8Array.from(snap.rawPayload));
    expect(ydoc.getMap('root').get('k')).toBe('v1');
    const recovered = await gql(
      app,
      cookies,
      RECOVER,
      {
        workspaceId: spaceId,
        docId: 'page',
        timestamp: histories[0]!.timestamp,
      },
      'recoverDoc'
    );
    const recoveredBody = recovered.json() as {
      data?: { recoverDoc?: string };
    };
    expect(recoveredBody.data?.recoverDoc).toBeTruthy();
    socket.disconnect();
  });

  it('accepts setBlob GraphQL multipart fallback', async () => {
    const { url, app } = await listenTestApp();
    const cookies = await signIn(app, 'upload-gql@example.com');
    const spaceId = await createWorkspace(app, cookies);
    const operations = JSON.stringify({
      query: `mutation setBlob($workspaceId: String!, $blob: Upload!) {
        setBlob(workspaceId: $workspaceId, blob: $blob)
      }`,
      variables: { workspaceId: spaceId, blob: null },
      operationName: 'setBlob',
    });
    const form = new FormData();
    form.set('operations', operations);
    form.set('map', JSON.stringify({ '0': ['variables.blob'] }));
    form.set('0', new Blob([PNG], { type: 'image/png' }), 'widget.png');
    const res = await fetch(`${url}/graphql`, {
      method: 'POST',
      headers: {
        cookie: cookies,
        'x-operation-name': 'setBlob',
      },
      body: form,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data?: { setBlob?: string };
      errors?: unknown;
    };
    expect(body.errors).toBeUndefined();
    expect(body.data?.setBlob).toBe('widget.png');
    const download = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${spaceId}/blobs/v1/widget.png?sourceType=currentDoc&docId=doc`,
      headers: { cookie: cookies },
    });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toBe('image/png');
  });
});
