import { describe, expect, test, vi } from 'vitest';

import { CloudAwarenessStorage } from '../impls/cloud/awareness';
import { CloudDocStorage } from '../impls/cloud/doc';

const base64UpdateA = 'AQID';
const base64UpdateB = 'BAUG';

class FakeSocket {
  connected = true;
  workspaceSyncActive = true;
  readonly joinedDocs = new Set<string>();
  readonly emitted: Array<{ event: string; payload: unknown }> = [];
  readonly handlers = new Map<string, (...args: unknown[]) => void>();

  readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  on(event: string, handler: (...args: unknown[]) => void) {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(handler);
    this.listeners.set(event, listeners);
    this.handlers.set(event, handler);
    return this;
  }

  once(event: string, handler: (...args: unknown[]) => void) {
    this.handlers.set(event, handler);
    return this;
  }

  off(event: string, handler?: (...args: unknown[]) => void) {
    const listeners = this.listeners.get(event) ?? [];
    if (handler) {
      const index = listeners.lastIndexOf(handler);
      if (index !== -1) listeners.splice(index, 1);
    } else listeners.length = 0;
    const last = listeners.at(-1);
    if (last) this.handlers.set(event, last);
    else this.handlers.delete(event);
    return this;
  }

  emitServer(event: string, payload: unknown) {
    for (const handler of this.listeners.get(event) ?? []) handler(payload);
  }

  emit(event: string, payload?: unknown) {
    this.emitted.push({ event, payload });
    return true;
  }

  async emitWithAck(
    event: string,
    payload: {
      docId?: string;
      spaces?: { docId?: string }[];
      intent?: 'create' | 'update';
    }
  ) {
    this.emitted.push({ event, payload });
    if (event === 'space:join-batch') {
      if (!this.workspaceSyncActive) {
        return {
          error: {
            name: 'WORKSPACE_SYNC_UNAVAILABLE',
            message: 'Workspace sync is not active',
          },
        };
      }
      for (const space of payload.spaces ?? []) {
        if (space.docId === 'denied') {
          return { error: { name: 'DOC_ACTION_DENIED', message: 'denied' } };
        }
        if (space.docId) this.joinedDocs.add(space.docId);
      }
    }
    if (event === 'space:load-doc' || event === 'space:push-doc-update') {
      if (payload.intent !== 'create')
        expect(this.joinedDocs.has(payload.docId!)).toBe(true);
      return {
        data: {
          missing: 'AAA=',
          state: 'AA==',
          timestamp: 1_000,
          accepted: true,
          created: payload.intent === 'create',
        },
      };
    }
    if (event === 'space:doc-lifecycle') {
      return { data: { timestamp: 1_000 } };
    }
    if (event === 'space:load-workspace-state')
      return {
        data: {
          docs: [
            {
              docId: 'doc-1',
              timestamp: 1000,
              lifecycle: 'trashed',
              lifecycleChangedAt: 1200,
            },
          ],
          clocks: { 'space-1': 900 },
        },
      };
    return {
      data: { clientId: 'client-1', success: true, protocolVersion: 2 },
    };
  }
}

describe('CloudDocStorage broadcast updates', () => {
  test('emits updates from batch payload', () => {
    const storage = new CloudDocStorage({
      accountId: 'account-1',
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
      accountId: 'account-1',
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
    const inventoryChanged = vi.fn();
    const unsubscribe =
      storage.subscribeWorkspaceStateInvalidation(inventoryChanged);
    storage.onServerInvalidation({
      spaceType: 'workspace',
      spaceId: 'space-1',
      inventoryChanged: true,
    });
    expect(inventoryChanged).toHaveBeenCalledOnce();
    expect(getDocTimestamps).toHaveBeenCalledOnce();
    unsubscribe();
  });

  test('batch route joins the workspace and applies lifecycle commands', async () => {
    vi.stubGlobal('BUILD_CONFIG', { appVersion: '0.27.5' });
    const fakeSocket = new FakeSocket();
    const disconnect = vi.fn();
    const storage = new CloudDocStorage({
      accountId: 'account-1',
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
    await storage.pushDocUpdate({
      docId: 'new-doc',
      bin: new Uint8Array([0, 0]),
      intent: 'create',
    });
    expect(fakeSocket.joinedDocs.has('new-doc')).toBe(false);
    expect(await storage.getWorkspaceState()).toEqual({
      docs: [
        {
          docId: 'doc-1',
          timestamp: 1000,
          lifecycle: 'trashed',
          lifecycleChangedAt: 1200,
        },
      ],
      clocks: { 'space-1': 900 },
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

    vi.useFakeTimers();
    const recoverySocket = new FakeSocket();
    recoverySocket.workspaceSyncActive = false;
    const recovery = new CloudAwarenessStorage({
      id: 'space-1',
      serverBaseUrl: 'http://localhost',
      isSelfHosted: true,
      type: 'workspace',
    });
    const disconnect = vi.fn();
    const connect = vi.fn(() => ({ socket: recoverySocket, disconnect }));
    Object.defineProperty(recovery.connection, 'manager', {
      value: { connect },
    });
    recovery.connection.retryDelay = 10;
    const collect = vi.fn(async () => null);
    const updates = vi.fn();
    const joinCount = () =>
      recoverySocket.emitted.filter(({ event }) => event === 'space:join-batch')
        .length;
    const collectCount = () =>
      recoverySocket.emitted.filter(
        ({ event }) => event === 'space:load-awarenesses'
      ).length;
    const docIds = Array.from({ length: 103 }, (_, index) => `doc-${index}`);
    const unsubscribes: Array<() => void> = [];
    try {
      recovery.connection.connect();
      await vi.advanceTimersByTimeAsync(0);
      for (const docId of docIds) {
        unsubscribes.push(recovery.subscribeUpdate(docId, updates, collect));
      }
      await vi.advanceTimersByTimeAsync(0);
      expect(recovery.connection.status).toBe('error');
      expect(recovery.connection.error?.name).toBe(
        'WORKSPACE_SYNC_UNAVAILABLE'
      );
      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(joinCount()).toBe(1);
      expect(collectCount()).toBe(0);
      expect(
        recoverySocket.listeners.get('space:collect-awareness')
      ).toHaveLength(0);
      const leaveTemporary = recovery.subscribeUpdate(
        'temporary',
        updates,
        collect
      );
      expect(() => leaveTemporary()).not.toThrow();

      await vi.advanceTimersByTimeAsync(10);
      expect(joinCount()).toBe(2);
      expect(disconnect).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(19);
      expect(joinCount()).toBe(2);
      recoverySocket.workspaceSyncActive = true;
      await vi.advanceTimersByTimeAsync(1);
      expect(connect).toHaveBeenCalledTimes(3);
      expect(recovery.connection.status).toBe('connected');
      expect(joinCount()).toBe(5);
      expect(collectCount()).toBe(103);
      expect([...recoverySocket.joinedDocs].sort()).toEqual([...docIds].sort());
      expect(
        recoverySocket.listeners.get('space:collect-awareness')
      ).toHaveLength(103);
      expect(
        recoverySocket.listeners.get('space:broadcast-awareness-update')
      ).toHaveLength(103);
      recoverySocket.emitServer('space:collect-awareness', {
        spaceType: 'workspace',
        spaceId: 'space-1',
        docId: 'doc-0',
      });
      recoverySocket.emitServer('space:broadcast-awareness-update', {
        spaceType: 'workspace',
        spaceId: 'space-1',
        docId: 'doc-0',
        awarenessUpdate: base64UpdateA,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(collect).toHaveBeenCalledTimes(1);
      expect(updates).toHaveBeenCalledTimes(1);
      for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
      expect(
        recoverySocket.listeners.get('space:collect-awareness')
      ).toHaveLength(0);
      expect(
        recoverySocket.listeners.get('space:broadcast-awareness-update')
      ).toHaveLength(0);
      const leaveDenied = recovery.subscribeUpdate('denied', updates, collect);
      await vi.advanceTimersByTimeAsync(0);
      expect(recovery.connection.status).toBe('connected');
      expect(connect).toHaveBeenCalledTimes(3);
      leaveDenied();
      recoverySocket.workspaceSyncActive = false;
      const leaveStopped = recovery.subscribeUpdate(
        'stopped',
        updates,
        collect
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(recovery.connection.status).toBe('error');
      recoverySocket.workspaceSyncActive = true;
      let finishJoin: (() => void) | undefined;
      const emitWithAck = recoverySocket.emitWithAck.bind(recoverySocket);
      vi.spyOn(recoverySocket, 'emitWithAck').mockImplementationOnce(
        async (event, payload) => {
          const response = await emitWithAck(event, payload);
          await new Promise<void>(resolve => {
            finishJoin = resolve;
          });
          return response;
        }
      );
      await vi.advanceTimersByTimeAsync(10);
      expect(recovery.connection.status).toBe('connecting');
      expect(finishJoin).toBeDefined();
      expect(() => leaveStopped()).not.toThrow();
      finishJoin?.();
      await vi.advanceTimersByTimeAsync(0);
      expect(recovery.connection.status).toBe('connected');
      expect(recoverySocket.emitted.at(-1)).toEqual({
        event: 'space:join-batch',
        payload: {
          spaces: [{ spaceType: 'workspace', spaceId: 'space-1' }],
          clientVersion: '0.27.5',
          protocolVersion: 2,
        },
      });
      expect(recoverySocket.joinedDocs.has('stopped')).toBe(false);
      recoverySocket.workspaceSyncActive = false;
      const leaveIdle = recovery.subscribeUpdate('idle', updates, collect);
      await vi.advanceTimersByTimeAsync(0);
      expect(recovery.connection.status).toBe('error');
      leaveIdle();
      const joinsBeforeIdleRetry = joinCount();
      await vi.advanceTimersByTimeAsync(10);
      expect(recovery.connection.status).toBe('connected');
      expect(joinCount()).toBe(joinsBeforeIdleRetry);
      recovery.connection.disconnect();
      const joinsBeforeStop = joinCount();
      await vi.advanceTimersByTimeAsync(100);
      expect(joinCount()).toBe(joinsBeforeStop);
      expect(collectCount()).toBe(103);
      expect(recovery.connection.status).toBe('closed');
    } finally {
      for (const unsubscribe of unsubscribes) unsubscribe();
      recovery.connection.disconnect();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
