import { describe, expect, test, vi } from 'vitest';

import { CloudAwarenessStorage } from '../impls/cloud/awareness';
import { CloudDocStorage } from '../impls/cloud/doc';

const base64UpdateA = 'AQID';
const base64UpdateB = 'BAUG';

class FakeSocket {
  connected = true;
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

  async emitWithAck(event: string, payload: unknown) {
    this.emitted.push({ event, payload });
    return { data: { clientId: 'client-1', success: true } };
  }
}

describe('CloudDocStorage broadcast updates', () => {
  test('emits updates from batch payload', () => {
    const storage = new CloudDocStorage({
      id: 'space-1',
      serverBaseUrl: 'http://localhost',
      isSelfHosted: true,
      syncProtocol: 'legacy',
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
      syncProtocol: 'batch',
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

  test.each([
    ['legacy', 'space:join'],
    ['batch', 'space:join-batch'],
  ] as const)(
    '%s route sends its own join event',
    async (syncProtocol, event) => {
      vi.stubGlobal('BUILD_CONFIG', { appVersion: '0.27.5' });
      const fakeSocket = new FakeSocket();
      const disconnect = vi.fn();
      const storage = new CloudDocStorage({
        id: 'space-1',
        serverBaseUrl: 'http://localhost',
        isSelfHosted: true,
        syncProtocol,
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
      vi.spyOn(connection, 'getIdConverter').mockResolvedValue({
        oldIdToNewId: (id: string) => id,
        newIdToOldId: (id: string) => id,
      });

      const inner = await connection.doConnect();
      expect(fakeSocket.emitted[0]?.event).toBe(event);

      inner.disconnect();
      vi.unstubAllGlobals();
    }
  );

  test.each([
    ['legacy', 'space:join-awareness'],
    ['batch', 'space:join-batch'],
  ] as const)(
    '%s awareness joins for active documents',
    async (syncProtocol, event) => {
      vi.stubGlobal('BUILD_CONFIG', { appVersion: '0.27.5' });
      const fakeSocket = new FakeSocket();
      const storage = new CloudAwarenessStorage({
        id: 'space-1',
        serverBaseUrl: 'http://localhost',
        isSelfHosted: true,
        syncProtocol,
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
            ({ event: emittedEvent }) => emittedEvent === event
          )
        ).toHaveLength(syncProtocol === 'batch' ? 1 : 2);
      });

      if (syncProtocol === 'batch') {
        expect(fakeSocket.emitted).toContainEqual({
          event,
          payload: {
            spaces: [
              { spaceType: 'workspace', spaceId: 'space-1', docId: 'doc-a' },
              { spaceType: 'workspace', spaceId: 'space-1', docId: 'doc-b' },
            ],
            clientVersion: '0.27.5',
          },
        });
      } else {
        expect(fakeSocket.emitted).toContainEqual({
          event,
          payload: {
            spaceType: 'workspace',
            spaceId: 'space-1',
            docId: 'doc-a',
            clientVersion: '0.27.5',
          },
        });
        expect(fakeSocket.emitted).toContainEqual({
          event,
          payload: {
            spaceType: 'workspace',
            spaceId: 'space-1',
            docId: 'doc-b',
            clientVersion: '0.27.5',
          },
        });
      }

      unsubscribeA();
      unsubscribeB();
      vi.unstubAllGlobals();
    }
  );
});
