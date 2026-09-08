import { describe, expect, test, vi } from 'vitest';

import { CloudAwarenessStorage } from '../impls/cloud/awareness';
import { CloudDocStorage } from '../impls/cloud/doc';

const base64UpdateA = 'AQID';
const base64UpdateB = 'BAUG';

class FakeSocket {
  connected = true;
  readonly joinedDocs = new Set<string>();
  readonly emitted: Array<{ event: string; payload: unknown }> = [];
  readonly handlers = new Map<string, (...args: unknown[]) => void>();

  on(event: string, handler: (...args: unknown[]) => void) {
    this.handlers.set(event, handler);
    return this;
  }

  once(event: string, handler: (...args: unknown[]) => void) {
    this.handlers.set(event, handler);
    return this;
  }

  off(event: string, handler?: (...args: unknown[]) => void) {
    if (!handler || this.handlers.get(event) === handler) {
      this.handlers.delete(event);
    }
    return this;
  }

  emit(event: string, payload?: unknown) {
    this.emitted.push({ event, payload });
    return true;
  }

  async emitWithAck(
    event: string,
    payload: { docId?: string; spaces?: { docId?: string }[] }
  ) {
    this.emitted.push({ event, payload });
    if (event === 'space:join-batch') {
      for (const space of payload.spaces ?? []) {
        if (space.docId === 'denied') {
          return { error: { name: 'DOC_ACTION_DENIED', message: 'denied' } };
        }
        if (space.docId) this.joinedDocs.add(space.docId);
      }
    }
    if (event === 'space:load-doc' || event === 'space:push-doc-update') {
      expect(this.joinedDocs.has(payload.docId!)).toBe(true);
      return { data: { missing: 'AAA=', state: 'AA==', timestamp: 1_000 } };
    }
    if (event === 'space:doc-lifecycle') {
      return { data: { rootUpdate: base64UpdateA, timestamp: 1_000 } };
    }
    return { data: { clientId: 'client-1', success: true } };
  }
}

describe('CloudDocStorage broadcast updates', () => {
  test('emits updates from batch payload', () => {
    const storage = new CloudDocStorage({
      id: 'space-1',
      serverBaseUrl: 'http://localhost',
      isSelfHosted: true,
      type: 'workspace',
      readonlyMode: true,
    });

    (storage as any).connection.idConverter = {
      oldIdToNewId: (id: string) => id,
      newIdToOldId: (id: string) => id,
    };

    const received: Uint8Array[] = [];
    storage.subscribeDocUpdate(update => {
      received.push(update.bin);
    });

    storage.onServerUpdates({
      spaceType: 'workspace',
      spaceId: 'space-1',
      docId: 'doc-1',
      updates: [base64UpdateA, base64UpdateB],
      timestamp: Date.now(),
    });

    expect(received).toEqual([
      new Uint8Array([1, 2, 3]),
      new Uint8Array([4, 5, 6]),
    ]);
  });

  test('repairs strict invalidation through readable timestamps', async () => {
    const storage = new CloudDocStorage({
      id: 'space-1',
      serverBaseUrl: 'http://localhost',
      isSelfHosted: true,
      type: 'workspace',
      readonlyMode: true,
    });

    (storage as any).connection.idConverter = {
      oldIdToNewId: (id: string) => id,
      newIdToOldId: (id: string) => id,
    };

    const getDocTimestamps = vi
      .spyOn(storage, 'getDocTimestamps')
      .mockResolvedValue({ 'doc-a': new Date(1_000) });
    const received: Array<{ docId: string; bin: Uint8Array }> = [];
    storage.subscribeDocUpdate(update => {
      received.push({ docId: update.docId, bin: update.bin });
    });

    storage.onServerInvalidation({
      spaceType: 'workspace',
      spaceId: 'space-1',
      timestamp: 1_000,
    });
    storage.onServerInvalidation({
      spaceType: 'workspace',
      spaceId: 'space-1',
      timestamp: 1_001,
    });

    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(getDocTimestamps).toHaveBeenCalledOnce();
    expect(received[0]).toMatchObject({ docId: 'doc-a' });
    expect(received[0]?.bin).toEqual(new Uint8Array());
  });

  test('batch route joins the workspace and applies lifecycle commands', async () => {
    vi.stubGlobal('BUILD_CONFIG', { appVersion: '0.27.5' });
    const fakeSocket = new FakeSocket();
    const disconnect = vi.fn();
    const storage = new CloudDocStorage({
      id: 'space-1',
      serverBaseUrl: 'http://localhost',
      isSelfHosted: true,
      type: 'workspace',
      readonlyMode: true,
    });
    const connection = storage.connection as any;

    Object.defineProperty(connection, 'manager', {
      configurable: true,
      value: {
        connect: () => ({ socket: fakeSocket, disconnect }),
      },
    });
    const inner = await connection.doConnect();
    connection._inner = inner;
    await storage.getDocSnapshot('doc-1');
    await storage.getDocDiff('doc-2');
    await storage.getDocTimestamp('doc-3');
    await storage.pushDocUpdate({
      docId: 'doc-4',
      bin: new Uint8Array([0, 0]),
    });
    const lifecycle = await storage.applyDocLifecycle('doc-1', 'trash');
    await expect(storage.getDocSnapshot('denied')).rejects.toMatchObject({
      name: 'DOC_ACTION_DENIED',
    });
    fakeSocket.joinedDocs.delete('doc-1');
    await storage.getDocDiff('doc-1');
    connection.doDisconnect(inner);
    expect({ emitted: fakeSocket.emitted, lifecycle }).toMatchSnapshot({
      lifecycle: {
        rootUpdate: expect.any(Uint8Array),
        timestamp: expect.any(Date),
      },
    });

    expect(disconnect).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  test('awareness joins active documents through the batch route', async () => {
    vi.stubGlobal('BUILD_CONFIG', { appVersion: '0.27.5' });
    const fakeSocket = new FakeSocket();
    const storage = new CloudAwarenessStorage({
      id: 'space-1',
      serverBaseUrl: 'http://localhost',
      isSelfHosted: true,
      type: 'workspace',
    });

    Object.defineProperty(storage, 'connection', {
      configurable: true,
      value: {
        status: 'connected',
        inner: { socket: fakeSocket },
        onStatusChanged: () => () => {},
      },
    });

    const unsubscribeA = storage.subscribeUpdate(
      'doc-a',
      () => {},
      async () => null
    );
    const unsubscribeB = storage.subscribeUpdate(
      'doc-b',
      () => {},
      async () => null
    );

    await vi.waitFor(() => {
      expect(
        fakeSocket.emitted.filter(
          ({ event: emittedEvent }) => emittedEvent === 'space:join-batch'
        )
      ).toHaveLength(1);
    });

    expect(fakeSocket.emitted).toMatchSnapshot();

    unsubscribeA();
    unsubscribeB();
    vi.unstubAllGlobals();
  });
});
