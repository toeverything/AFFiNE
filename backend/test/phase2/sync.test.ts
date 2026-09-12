import { io, type Socket } from 'socket.io-client';
import { describe, expect, it } from 'vitest';
import {
  applyUpdate,
  Doc as YDoc,
  encodeStateAsUpdate,
  encodeStateVector,
} from 'yjs';

import { listenTestApp } from '../helpers/app.js';
import { cookieHeader } from '../helpers/cookies.js';

const CREATE = `mutation createWorkspace {
  createWorkspace { id public createdAt }
}`;

async function signIn(
  app: Awaited<ReturnType<typeof listenTestApp>>['app'],
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
  app: Awaited<ReturnType<typeof listenTestApp>>['app'],
  cookies: string
) {
  const res = await app.inject({
    method: 'POST',
    url: '/graphql',
    headers: {
      'content-type': 'application/json',
      cookie: cookies,
      'x-operation-name': 'createWorkspace',
    },
    payload: { query: CREATE },
  });
  const body = res.json() as { data: { createWorkspace: { id: string } } };
  return body.data.createWorkspace.id;
}

function connect(
  url: string,
  auth: { cookie?: string; token?: string }
): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const extraHeaders: Record<string, string> = {};
    if (auth.cookie) {
      extraHeaders.cookie = auth.cookie;
    }
    const socket = io(url, {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      extraHeaders,
      auth: auth.token ? { token: auth.token, tokenType: 'jwt' } : {},
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

async function join(socket: Socket, spaceId: string, docId?: string) {
  const spaces = [
    { spaceType: 'workspace', spaceId, ...(docId ? { docId } : {}) },
  ];
  const res = (await socket.timeout(8_000).emitWithAck('space:join-batch', {
    spaces,
    clientVersion: '0.27.5',
  })) as {
    data?: { success: boolean; clientId: string };
    error?: { name: string };
  };
  return res;
}

function mapUpdate(key: string, value: string): Uint8Array {
  const doc = new YDoc();
  doc.getMap('root').set(key, value);
  return encodeStateAsUpdate(doc);
}

describe('Phase 2 — Doc Sync', () => {
  it('serves an Engine.IO handshake at /socket.io', async () => {
    const { url } = await listenTestApp();
    const res = await fetch(`${url}/socket.io/?EIO=4&transport=polling`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
    expect(body.startsWith('0')).toBe(true);
  });

  it('two clients converge on concurrent edits', async () => {
    const { app, url } = await listenTestApp();
    const cookies = await signIn(app, 'sync@example.com');
    const spaceId = await createWorkspace(app, cookies);
    const docId = spaceId;

    const a = await connect(url, { cookie: cookies });
    const b = await connect(url, { cookie: cookies });
    expect((await join(a, spaceId, docId)).data?.success).toBe(true);
    expect((await join(b, spaceId, docId)).data?.success).toBe(true);

    const fromB = new Promise<string[]>(resolve => {
      b.once(
        'space:broadcast-doc-updates',
        (payload: { updates: string[] }) => {
          resolve(payload.updates);
        }
      );
    });

    const ua = mapUpdate('a', '1');
    const pushA = (await a.emitWithAck('space:push-doc-update', {
      spaceType: 'workspace',
      spaceId,
      docId,
      update: Buffer.from(ua).toString('base64'),
    })) as { data?: { timestamp: number }; error?: { name: string } };
    expect(pushA.data?.timestamp).toBeGreaterThan(0);
    await fromB;

    const ub = mapUpdate('b', '2');
    await b.emitWithAck('space:push-doc-update', {
      spaceType: 'workspace',
      spaceId,
      docId,
      update: Buffer.from(ub).toString('base64'),
    });

    const loaded = (await a.emitWithAck('space:load-doc', {
      spaceType: 'workspace',
      spaceId,
      docId,
    })) as { data: { missing: string; state: string; timestamp: number } };

    const merged = new YDoc();
    applyUpdate(merged, Buffer.from(loaded.data.missing, 'base64'));
    expect(merged.getMap('root').toJSON()).toMatchObject({ a: '1', b: '2' });

    a.disconnect();
    b.disconnect();
  });

  it('reconnects after offline without losing updates', async () => {
    const { app, url } = await listenTestApp();
    const cookies = await signIn(app, 'offline@example.com');
    const spaceId = await createWorkspace(app, cookies);
    const docId = 'page-1';

    const a = await connect(url, { cookie: cookies });
    const b = await connect(url, { cookie: cookies });
    await join(a, spaceId, docId);
    await join(b, spaceId, docId);

    const first = mapUpdate('n', '1');
    await a.emitWithAck('space:push-doc-update', {
      spaceType: 'workspace',
      spaceId,
      docId,
      update: Buffer.from(first).toString('base64'),
    });

    const snapshot = (await b.emitWithAck('space:load-doc', {
      spaceType: 'workspace',
      spaceId,
      docId,
    })) as { data: { missing: string; state: string } };
    const bDoc = new YDoc();
    applyUpdate(bDoc, Buffer.from(snapshot.data.missing, 'base64'));
    const vector = encodeStateVector(bDoc);
    b.disconnect();

    const second = mapUpdate('extra', 'yes');
    await a.emitWithAck('space:push-doc-update', {
      spaceType: 'workspace',
      spaceId,
      docId,
      update: Buffer.from(second).toString('base64'),
    });

    const b2 = await connect(url, { cookie: cookies });
    await join(b2, spaceId, docId);
    const diff = (await b2.emitWithAck('space:load-doc', {
      spaceType: 'workspace',
      spaceId,
      docId,
      stateVector: Buffer.from(vector).toString('base64'),
    })) as { data: { missing: string } };
    applyUpdate(bDoc, Buffer.from(diff.data.missing, 'base64'));
    expect(bDoc.getMap('root').get('n')).toBe('1');
    expect(bDoc.getMap('root').get('extra')).toBe('yes');

    a.disconnect();
    b2.disconnect();
  });

  it('compacts many small updates into a snapshot', async () => {
    const { app, url, store } = await listenTestApp({
      SYNC_COMPACT_UPDATES: 3,
    });
    const cookies = await signIn(app, 'compact@example.com');
    const spaceId = await createWorkspace(app, cookies);
    const docId = 'compact-doc';
    const socket = await connect(url, { cookie: cookies });
    await join(socket, spaceId, docId);

    const origin = new YDoc();
    origin.getMap('root');
    const increments: Uint8Array[] = [];
    origin.on('update', (update: Uint8Array) => {
      increments.push(Uint8Array.from(update));
    });
    origin.getMap('root').set('k', '0');
    origin.getMap('root').set('k', '1');
    origin.getMap('root').set('k', '2');
    expect(increments).toHaveLength(3);

    for (const update of increments) {
      await socket.timeout(8_000).emitWithAck('space:push-doc-update', {
        spaceType: 'workspace',
        spaceId,
        docId,
        update: Buffer.from(update).toString('base64'),
      });
    }

    const pending = await store.listUpdates('workspace', spaceId, docId);
    expect(pending).toHaveLength(0);
    const record = await store.getDocument('workspace', spaceId, docId);
    expect(record?.snapshot && record.snapshot.byteLength).toBeGreaterThan(0);

    const loaded = (await socket.emitWithAck('space:load-doc', {
      spaceType: 'workspace',
      spaceId,
      docId,
    })) as { data: { missing: string } };
    const ydoc = new YDoc();
    applyUpdate(ydoc, Buffer.from(loaded.data.missing, 'base64'));
    expect(ydoc.getMap('root').get('k')).toBe('2');
    socket.disconnect();
  });

  it('denies join/push without workspace membership', async () => {
    const { app, url } = await listenTestApp();
    const ownerCookies = await signIn(app, 'owner@example.com');
    const spaceId = await createWorkspace(app, ownerCookies);
    const strangerCookies = await signIn(app, 'stranger@example.com');
    const socket = await connect(url, { cookie: strangerCookies });
    const joined = await join(socket, spaceId, spaceId);
    expect(joined.error?.name).toBe('SPACE_ACCESS_DENIED');

    const pushed = (await socket.emitWithAck('space:push-doc-update', {
      spaceType: 'workspace',
      spaceId,
      docId: spaceId,
      update: Buffer.from(mapUpdate('x', '1')).toString('base64'),
    })) as { error?: { name: string } };
    expect(pushed.error?.name).toBe('SPACE_ACCESS_DENIED');
    socket.disconnect();
  });

  it('isolates rooms so workspace A does not see B', async () => {
    const { app, url } = await listenTestApp();
    const cookies = await signIn(app, 'rooms@example.com');
    const spaceA = await createWorkspace(app, cookies);
    const spaceB = await createWorkspace(app, cookies);
    const a = await connect(url, { cookie: cookies });
    const b = await connect(url, { cookie: cookies });
    await join(a, spaceA, 'doc');
    await join(b, spaceB, 'doc');

    let leaked = false;
    b.on('space:broadcast-doc-updates', (payload: { spaceId: string }) => {
      if (payload.spaceId === spaceA) {
        leaked = true;
      }
    });

    await a.emitWithAck('space:push-doc-update', {
      spaceType: 'workspace',
      spaceId: spaceA,
      docId: 'doc',
      update: Buffer.from(mapUpdate('secret', 'yes')).toString('base64'),
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(leaked).toBe(false);

    const timestamps = (await b.emitWithAck('space:load-doc-timestamps', {
      spaceType: 'workspace',
      spaceId: spaceB,
    })) as { data: Record<string, number> };
    expect(timestamps.data.doc).toBeUndefined();

    a.disconnect();
    b.disconnect();
  });

  it('retries the same update idempotently', async () => {
    const { app, url, store } = await listenTestApp();
    const cookies = await signIn(app, 'idem@example.com');
    const spaceId = await createWorkspace(app, cookies);
    const socket = await connect(url, { cookie: cookies });
    await join(socket, spaceId, 'doc');
    const update = Buffer.from(mapUpdate('once', '1')).toString('base64');
    const payload = {
      spaceType: 'workspace',
      spaceId,
      docId: 'doc',
      update,
    };
    const first = (await socket.emitWithAck(
      'space:push-doc-update',
      payload
    )) as {
      data: { timestamp: number };
    };
    const second = (await socket.emitWithAck(
      'space:push-doc-update',
      payload
    )) as {
      data: { timestamp: number };
    };
    expect(second.data.timestamp).toBe(first.data.timestamp);
    const pending = await store.listUpdates('workspace', spaceId, 'doc');
    expect(pending).toHaveLength(1);
    socket.disconnect();
  });

  it('collects awareness from other members of the doc room', async () => {
    const { app, url } = await listenTestApp();
    const cookies = await signIn(app, 'aware@example.com');
    const spaceId = await createWorkspace(app, cookies);
    const a = await connect(url, { cookie: cookies });
    const b = await connect(url, { cookie: cookies });
    await join(a, spaceId, 'doc');
    await join(b, spaceId, 'doc');

    const collected = new Promise<void>(resolve => {
      a.once('space:collect-awareness', (payload: { docId: string }) => {
        expect(payload.docId).toBe('doc');
        a.emit('space:update-awareness', {
          spaceType: 'workspace',
          spaceId,
          docId: 'doc',
          awarenessUpdate: Buffer.from('hello').toString('base64'),
        });
        resolve();
      });
    });

    const broadcast = new Promise<string>(resolve => {
      b.once(
        'space:broadcast-awareness-update',
        (payload: { awarenessUpdate: string }) => {
          resolve(payload.awarenessUpdate);
        }
      );
    });

    b.emit('space:load-awarenesses', {
      spaceType: 'workspace',
      spaceId,
      docId: 'doc',
    });

    await collected;
    const encoded = await broadcast;
    expect(Buffer.from(encoded, 'base64').toString()).toBe('hello');
    a.disconnect();
    b.disconnect();
  });

  it('returns DOC_NOT_FOUND until the first push', async () => {
    const { app, url } = await listenTestApp();
    const cookies = await signIn(app, 'missing-doc@example.com');
    const spaceId = await createWorkspace(app, cookies);
    const socket = await connect(url, { cookie: cookies });
    await join(socket, spaceId, 'ghost');
    const loaded = (await socket.timeout(8_000).emitWithAck('space:load-doc', {
      spaceType: 'workspace',
      spaceId,
      docId: 'ghost',
    })) as { error?: { name: string } };
    expect(loaded.error?.name).toBe('DOC_NOT_FOUND');
    socket.disconnect();
  });

  it('serves a materialized snapshot over REST', async () => {
    const { app, url } = await listenTestApp();
    const cookies = await signIn(app, 'rest-doc@example.com');
    const spaceId = await createWorkspace(app, cookies);
    const socket = await connect(url, { cookie: cookies });
    await join(socket, spaceId, 'page');
    await socket.timeout(8_000).emitWithAck('space:push-doc-update', {
      spaceType: 'workspace',
      spaceId,
      docId: 'page',
      update: Buffer.from(mapUpdate('rest', 'ok')).toString('base64'),
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/workspaces/${spaceId}/docs/page`,
      headers: { cookie: cookies },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/octet-stream/);
    const ydoc = new YDoc();
    applyUpdate(ydoc, Uint8Array.from(res.rawPayload));
    expect(ydoc.getMap('root').get('rest')).toBe('ok');
    socket.disconnect();
  });

  it('authenticates native Socket.IO clients with an access token', async () => {
    const { app, url } = await listenTestApp();
    const sign = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in',
      headers: {
        'content-type': 'application/json',
        'x-affine-client-kind': 'native',
      },
      payload: { email: 'native-sync@example.com', password: 'correcthorse' },
    });
    expect(sign.statusCode).toBe(200);
    const { exchangeCode } = sign.json() as { exchangeCode: string };
    const cookies = cookieHeader(sign);
    const spaceId = await createWorkspace(app, cookies);
    const exchanged = await app.inject({
      method: 'POST',
      url: '/api/auth/session/exchange',
      headers: { 'content-type': 'application/json' },
      payload: {
        code: exchangeCode,
        installationId: 'install-1',
        platform: 'electron',
      },
    });
    expect(exchanged.statusCode).toBe(200);
    const { accessToken } = exchanged.json() as { accessToken: string };
    const socket = await connect(url, { token: accessToken });
    expect((await join(socket, spaceId, spaceId)).data?.success).toBe(true);
    socket.disconnect();
  });

  it('rejects join batches larger than 100', async () => {
    const { app, url } = await listenTestApp();
    const cookies = await signIn(app, 'batch@example.com');
    const spaceId = await createWorkspace(app, cookies);
    const socket = await connect(url, { cookie: cookies });
    const spaces = Array.from({ length: 101 }, () => ({
      spaceType: 'workspace',
      spaceId,
    }));
    const res = (await socket.timeout(8_000).emitWithAck('space:join-batch', {
      spaces,
      clientVersion: '0.27.5',
    })) as { error?: { name: string } };
    expect(res.error?.name).toBe('BAD_REQUEST');
    socket.disconnect();
  });

  it('stubs telemetry:batch and forbids realtime subscribe', async () => {
    const { app, url } = await listenTestApp();
    const cookies = await signIn(app, 'telemetry@example.com');
    const socket = await connect(url, { cookie: cookies });
    const telemetry = (await socket
      .timeout(8_000)
      .emitWithAck('telemetry:batch', {
        events: [{ name: 'ping' }],
      })) as { data?: { ok: true; accepted: number; dropped: number } };
    expect(telemetry.data).toEqual({ ok: true, accepted: 1, dropped: 0 });
    const realtime = (await socket
      .timeout(8_000)
      .emitWithAck('realtime:subscribe', {
        topic: 'x',
      })) as { error?: { name: string } };
    expect(realtime.error?.name).toBe('ACTION_FORBIDDEN');
    const unsub = (await socket
      .timeout(8_000)
      .emitWithAck('realtime:unsubscribe', {
        subscriptionId: 'x',
      })) as { data?: { ok: true } };
    expect(unsub.data?.ok).toBe(true);
    socket.disconnect();
  });

  it('allows userspace only for the owning user id', async () => {
    const { app, url } = await listenTestApp();
    const cookies = await signIn(app, 'userspace@example.com');
    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: cookies },
    });
    const userId = (session.json() as { user: { id: string } }).user.id;
    const socket = await connect(url, { cookie: cookies });
    const ok = (await socket.timeout(8_000).emitWithAck('space:join-batch', {
      spaces: [{ spaceType: 'userspace', spaceId: userId, docId: 'settings' }],
      clientVersion: '0.27.5',
    })) as { data?: { success: boolean } };
    expect(ok.data?.success).toBe(true);
    const denied = (await socket
      .timeout(8_000)
      .emitWithAck('space:join-batch', {
        spaces: [
          {
            spaceType: 'userspace',
            spaceId: 'someone-else',
            docId: 'settings',
          },
        ],
        clientVersion: '0.27.5',
      })) as { error?: { name: string } };
    expect(denied.error?.name).toBe('SPACE_ACCESS_DENIED');
    socket.disconnect();
  });

  it('deletes a doc so a later load is DOC_NOT_FOUND', async () => {
    const { app, url } = await listenTestApp();
    const cookies = await signIn(app, 'delete-doc@example.com');
    const spaceId = await createWorkspace(app, cookies);
    const socket = await connect(url, { cookie: cookies });
    await join(socket, spaceId, 'gone');
    await socket.timeout(8_000).emitWithAck('space:push-doc-update', {
      spaceType: 'workspace',
      spaceId,
      docId: 'gone',
      update: Buffer.from(mapUpdate('k', '1')).toString('base64'),
    });
    const deleted = (await socket
      .timeout(8_000)
      .emitWithAck('space:delete-doc', {
        spaceType: 'workspace',
        spaceId,
        docId: 'gone',
      })) as { data?: { success: true } };
    expect(deleted.data?.success).toBe(true);
    const loaded = (await socket.timeout(8_000).emitWithAck('space:load-doc', {
      spaceType: 'workspace',
      spaceId,
      docId: 'gone',
    })) as { error?: { name: string } };
    expect(loaded.error?.name).toBe('DOC_NOT_FOUND');
    socket.disconnect();
  });

  it('trashes a document through space:doc-lifecycle', async () => {
    const { app, url, store } = await listenTestApp();
    const cookies = await signIn(app, 'lifecycle@example.com');
    const spaceId = await createWorkspace(app, cookies);
    const socket = await connect(url, { cookie: cookies });
    await join(socket, spaceId, 'page');
    await socket.timeout(8_000).emitWithAck('space:push-doc-update', {
      spaceType: 'workspace',
      spaceId,
      docId: 'page',
      update: Buffer.from(mapUpdate('k', '1')).toString('base64'),
    });
    const trashed = (await socket
      .timeout(8_000)
      .emitWithAck('space:doc-lifecycle', {
        spaceType: 'workspace',
        spaceId,
        docId: 'page',
        lifecycle: 'trash',
      })) as { data?: { timestamp: number }; error?: { name: string } };
    expect(trashed.data?.timestamp).toBeGreaterThan(0);
    const record = await store.getDocument('workspace', spaceId, 'page');
    expect(record?.lifecycle).toBe('trash');
    socket.disconnect();
  });
});
